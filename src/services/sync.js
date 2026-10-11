import db from './db'
import { getDriveAccessToken, uploadItemToDrive, downloadDriveFile } from './drive'
import { buildDrivePath, sanitizeFileName } from '../utils/sanitize'

// Single global in-flight sync lock (Fixes B4)
let inFlightSyncPromise = null

// Keep the on-demand cache bounded even when individual files are large.
const MAX_CACHED_FILES = 20
const MAX_CACHED_BYTES = 100 * 1024 * 1024

function getFolderPath(item, semester, subject) {
  return buildDrivePath(semester.name, item.exam, subject.name)
}

function buildTextFileName(item) {
  const now = new Date(item.createdAt || Date.now())
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')

  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('-')

  const words = String(item.text || item.title || 'note')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ')
    .replace(/[^a-zA-Z0-9\- ]/g, '')
    .trim()

  const prefix = words || 'note'
  return `${stamp}_${time}_${prefix}.txt`
}

function prepareDrivePayload(item) {
  if (item.type === 'text') {
    const rawFileName = item.fileName || buildTextFileName(item)
    return {
      ...item,
      fileName: sanitizeFileName(rawFileName, 'note.txt'),
      mimeType: item.mimeType || 'text/plain',
      blob: new Blob([item.text || ''], { type: 'text/plain' }),
      caption: item.caption || item.text || '',
    }
  }

  const rawFileName = item.fileName || item.title || 'file'
  return {
    ...item,
    fileName: sanitizeFileName(rawFileName, 'file'),
    mimeType: item.mimeType || 'application/octet-stream',
    caption: item.caption || '',
  }
}

function getRetryDelay(retryCount) {
  return Math.min(1000 * 2 ** Math.min(retryCount || 0, 6), 300000)
}

/**
 * Generate a ~400px JPEG thumbnail for photos before local blob is dropped (Fixes B3).
 */
export async function generateThumbnail(blob, maxDimension = 400) {
  if (!blob || !(blob instanceof Blob) || !blob.type.startsWith('image/')) {
    return null
  }

  if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
    try {
      const image = await createImageBitmap(blob)
      if (image.width <= maxDimension && image.height <= maxDimension) {
        image.close()
        return blob
      }

      const scale = Math.min(maxDimension / image.width, maxDimension / image.height)
      const width = Math.round(image.width * scale)
      const height = Math.round(image.height * scale)
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')
      if (!context) {
        image.close()
        return null
      }

      context.drawImage(image, 0, 0, width, height)
      image.close()
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 })
    } catch {
      return null
    }
  }

  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return null
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img

      if (width <= maxDimension && height <= maxDimension) {
        resolve(blob)
        return
      }

      if (width > height) {
        height = Math.round((height * maxDimension) / width)
        width = maxDimension
      } else {
        width = Math.round((width * maxDimension) / height)
        height = maxDimension
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        resolve(null)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (thumb) => {
          resolve(thumb)
        },
        'image/jpeg',
        0.75,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }

    img.src = url
  })
}

/**
 * Recover any items stuck in 'uploading' state due to app reload or crash (Fixes B4).
 */
export async function recoverStuckUploadingItems() {
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString()
  const stuckItems = await db.items
    .where('syncStatus')
    .equals('uploading')
    .filter((item) => !item.updatedAt || item.updatedAt < threeMinutesAgo)
    .toArray()

  for (const item of stuckItems) {
    await db.items.update(item.id, {
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    })
  }
}

export async function getPendingCount() {
  return db.items.where('syncStatus').equals('pending').count()
}

export async function getFailedCount() {
  return db.items.where('syncStatus').equals('failed').count()
}

/**
 * Reset all failed items back to 'pending' so the user can manually retry them (Fixes B14).
 */
export async function retryFailedItems() {
  const failed = await db.items.where('syncStatus').equals('failed').toArray()
  for (const item of failed) {
    await db.items.update(item.id, {
      syncStatus: 'pending',
      errorMessage: '',
      retryAt: 0,
      retryCount: 0,
      updatedAt: new Date().toISOString(),
    })
  }
}

/**
 * Upload pending items to Google Drive with locking and thumbnail persistence (Fixes B3, B4).
 */
export async function syncPendingItems(onProgress) {
  // If an upload is already running, wait for it instead of starting another (Fixes B4)
  if (inFlightSyncPromise) {
    return inFlightSyncPromise
  }

  inFlightSyncPromise = (async () => {
    try {
      // First, recover any stale uploading states
      await recoverStuckUploadingItems()

      const auth = await getDriveAccessToken()
      if (!auth.ok) {
        return { ok: false, reason: auth.message || 'Google Drive is not connected.' }
      }

      const now = Date.now()
      const itemsToSync = await db.items
        .filter(
          (item) =>
            item.syncStatus === 'pending' ||
            (item.syncStatus === 'failed' && (!item.retryAt || item.retryAt <= now)),
        )
        .toArray()

      if (!itemsToSync.length) {
        return { ok: true, uploaded: 0, total: 0 }
      }

      let uploaded = 0

      for (let index = 0; index < itemsToSync.length; index++) {
        const candidate = itemsToSync[index]
        let item = candidate

        try {
          item = await db.transaction('rw', db.items, async () => {
            const current = await db.items.get(candidate.id)
            if (!current || current.syncStatus === 'uploading' || current.syncStatus === 'synced') {
              return null
            }
            if (current.syncStatus === 'failed' && current.retryAt && current.retryAt > Date.now()) {
              return null
            }
            await db.items.update(current.id, {
              syncStatus: 'uploading',
              updatedAt: new Date().toISOString(),
            })
            return { ...current, syncStatus: 'uploading' }
          })
          if (!item) continue

          if (typeof onProgress === 'function') {
            onProgress({ current: index + 1, total: itemsToSync.length, item })
          }

          const semester = await db.semesters.get(item.semesterId)
          const subject = await db.subjects.get(item.subjectId)

          if (!semester || !subject) {
            await db.items.update(item.id, {
              syncStatus: 'failed',
              retryAt: Date.now() + getRetryDelay((item.retryCount || 0) + 1),
              retryCount: (item.retryCount || 0) + 1,
              errorMessage: 'Missing semester or subject data.',
              updatedAt: new Date().toISOString(),
            })
            continue
          }

          const folderPath = getFolderPath(item, semester, subject)
          const payload = prepareDrivePayload(item)

          // Generate thumbnail before uploading and removing the full blob (Fixes B3)
          let thumbBlob = item.thumbBlob
          if (item.type === 'photo' && item.blob && !thumbBlob) {
            thumbBlob = await generateThumbnail(item.blob)
          }

          const result = await uploadItemToDrive({
            item: payload,
            folderPath,
            accessToken: auth.accessToken,
          })

          // Mark synced: preserve thumbBlob, clear full blob to save storage
          await db.items.update(item.id, {
            syncStatus: 'synced',
            driveFileId: result.id,
            driveModifiedTime: result.modifiedTime || '',
            errorMessage: '',
            retryAt: 0,
            retryCount: 0,
            blob: null,
            thumbBlob: thumbBlob || null,
            updatedAt: new Date().toISOString(),
          })

          uploaded += 1
        } catch (error) {
          console.error(`[ClassVault Sync] item ${item.id} failed:`, error)
          const nextRetryCount = (item.retryCount || 0) + 1
          await db.items.update(item.id, {
            syncStatus: 'failed',
            retryAt: Date.now() + getRetryDelay(nextRetryCount),
            retryCount: nextRetryCount,
            errorMessage: error.message || 'Upload failed.',
            updatedAt: new Date().toISOString(),
          })
        }
      }

      return { ok: true, uploaded, total: itemsToSync.length }
    } finally {
      inFlightSyncPromise = null
    }
  })()

  return inFlightSyncPromise
}

/**
 * Fetch a synced photo or file from Google Drive on demand (Fixes B3).
 * Caches recently viewed files in Dexie filesCache table.
 */
export async function fetchDriveFileOnDemand(item) {
  if (!item || !item.driveFileId) {
    throw new Error('Item does not have a Google Drive file ID.')
  }

  // 1. Check local Dexie filesCache
  const cached = await db.filesCache.get(item.driveFileId)
  if (cached && cached.blob) {
    return cached.blob
  }

  // 2. If offline, alert student clearly
  if (!navigator.onLine) {
    throw new Error('You are offline. Connect to the internet to download this file.')
  }

  // 3. Obtain auth token
  const auth = await getDriveAccessToken()
  if (!auth.ok) {
    throw new Error(auth.message || 'Please connect Google Drive to access this file.')
  }

  // 4. Download file blob from Drive
  let downloadedBlob
  try {
    downloadedBlob = await downloadDriveFile(item.driveFileId, auth.accessToken)
  } catch (err) {
    if (err.message && (err.message.includes('404') || err.message.toLowerCase().includes('not found'))) {
      if (item.blob) {
        await db.items.update(item.id, { driveFileId: null, syncStatus: 'pending' })
        return item.blob
      }
      throw new Error('This file was removed from Google Drive and is no longer on this device.')
    }
    throw err
  }

  // 5. Cache downloaded blob locally in Dexie
  await db.filesCache.put({
    driveFileId: item.driveFileId,
    blob: downloadedBlob,
    fileName: item.fileName,
    mimeType: item.mimeType,
    cachedAt: Date.now(),
  })

  // 6. Enforce cache limit (MAX_CACHED_FILES)
  const cachedFiles = await db.filesCache.orderBy('cachedAt').toArray()
  let cachedBytes = cachedFiles.reduce((total, entry) => total + (entry.blob?.size || 0), 0)
  let cachedCount = cachedFiles.length
  for (const entry of cachedFiles) {
    if (cachedCount <= MAX_CACHED_FILES && cachedBytes <= MAX_CACHED_BYTES) break
    await db.filesCache.delete(entry.driveFileId)
    cachedCount -= 1
    cachedBytes -= entry.blob?.size || 0
  }

  return downloadedBlob
}
