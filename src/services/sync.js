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

import { optimizeImage, generateThumbnail } from '../utils/image'
import { showSyncProgressNotification, showSyncCompleteNotification } from './notifications'
export { generateThumbnail }

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
const SYNC_LOCK_KEY = 'classvault.syncLock'
const SYNC_LOCK_TTL_MS = 45000 // 45s TTL

export async function syncPendingItems(onProgress) {
  // 1. Thread-local in-flight sync lock (Fixes B4)
  if (inFlightSyncPromise) {
    return inFlightSyncPromise
  }

  inFlightSyncPromise = (async () => {
    let lockAcquired = false
    try {
      // 2. Cross-context lock (prevents window & service worker from stepping on each other)
      const existingLock = await db.settings.get(SYNC_LOCK_KEY)
      if (existingLock?.value) {
        const lockAge = Date.now() - Number(existingLock.value)
        if (lockAge < SYNC_LOCK_TTL_MS) {
          return { ok: true, inProgress: true }
        }
      }
      await db.settings.put({ key: SYNC_LOCK_KEY, value: String(Date.now()) })
      lockAcquired = true

      // First, recover any stale uploading states
      await recoverStuckUploadingItems()

      const auth = await getDriveAccessToken()
      if (!auth.ok) {
        return { ok: false, reason: auth.message || 'Google Drive is not connected.' }
      }

      const now = Date.now()
      // Fast index queries using IndexedDB B-tree indexes instead of full table scan
      const [pendingItems, failedItems] = await Promise.all([
        db.items.where('syncStatus').equals('pending').toArray(),
        db.items.where('syncStatus').equals('failed').toArray(),
      ])

      const eligibleFailed = failedItems.filter((item) => !item.retryAt || item.retryAt <= now)
      const itemsToSync = [...pendingItems, ...eligibleFailed]

      if (!itemsToSync.length) {
        return { ok: true, uploaded: 0, total: 0 }
      }

      let uploaded = 0
      let failedCount = 0
      let activeIndex = 0

      // Show initial single notification in Android notification drawer
      showSyncProgressNotification({ current: 0, total: itemsToSync.length }).catch(() => undefined)

      async function syncWorker() {
        while (activeIndex < itemsToSync.length) {
          const currentIndex = activeIndex++
          const candidate = itemsToSync[currentIndex]
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
              onProgress({ current: currentIndex + 1, total: itemsToSync.length, item })
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
              failedCount += 1
              continue
            }

            const folderPath = getFolderPath(item, semester, subject)
            let payload = prepareDrivePayload(item)

            // Generate thumbnail & compress large photos before uploading (Fixes B3, B4)
            let thumbBlob = item.thumbBlob
            if (item.type === 'photo' && item.blob) {
              if (!thumbBlob) {
                thumbBlob = await generateThumbnail(item.blob)
              }
              if (item.blob.size > 1.5 * 1024 * 1024) {
                const optimized = await optimizeImage(item.blob)
                payload.blob = optimized
                payload.fileSize = optimized.size
              }
            }

            const result = await uploadItemToDrive({
              item: payload,
              folderPath,
              accessToken: auth.accessToken,
            })

            // Mark synced: preserve full blob so local photos remain crisp & available offline
            await db.items.update(item.id, {
              syncStatus: 'synced',
              driveFileId: result.id,
              driveModifiedTime: result.modifiedTime || '',
              errorMessage: '',
              retryAt: 0,
              retryCount: 0,
              blob: item.blob || null,
              thumbBlob: thumbBlob || item.thumbBlob || null,
              updatedAt: new Date().toISOString(),
            })

            uploaded += 1

            // Update the single ongoing notification in-place
            showSyncProgressNotification({ current: uploaded, total: itemsToSync.length }).catch(() => undefined)
          } catch (error) {
            console.error(`[ClassVault Sync] item ${candidate.id} failed:`, error)
            failedCount += 1
            const nextRetryCount = (candidate.retryCount || 0) + 1
            await db.items.update(candidate.id, {
              syncStatus: 'failed',
              retryAt: Date.now() + getRetryDelay(nextRetryCount),
              retryCount: nextRetryCount,
              errorMessage: error.message || 'Upload failed.',
              updatedAt: new Date().toISOString(),
            })
          }
        }
      }

      const workerCount = Math.min(2, itemsToSync.length)
      await Promise.all(Array.from({ length: workerCount }, () => syncWorker()))

      // Always notify completion/status so notifications are never stuck
      if (uploaded > 0 || failedCount > 0) {
        showSyncCompleteNotification({
          uploaded,
          failedCount,
          total: itemsToSync.length,
        }).catch(() => undefined)
      }

      return { ok: true, uploaded, failed: failedCount, total: itemsToSync.length }
    } finally {
      if (lockAcquired) {
        await db.settings.delete(SYNC_LOCK_KEY).catch(() => undefined)
      }
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

  // Update item in local items database so it stays permanently cached
  if (item.id) {
    await db.items.update(item.id, {
      blob: downloadedBlob,
      thumbBlob: downloadedBlob,
    }).catch(() => {})
  }

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
