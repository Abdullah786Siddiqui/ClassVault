import db from './db'

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const ROOT_FOLDER_NAME = 'ClassVault'
const SESSION_TOKEN_KEY = 'classvault.driveAccessToken'
const DRIVE_TOKEN_SETTING = 'classvault.driveAccessToken'
const inFlightFolderPaths = new Map()

const tokenState = {
  accessToken: '',
  expiresAt: 0,
}

function getClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
}

export async function resetDriveFolderCache() {
  await db.driveFolders.clear()
}

export async function renameDriveFolderPath(oldRawPath, newRawPath) {
  const oldPath = getRootedFolderPath(oldRawPath)
  const newPath = getRootedFolderPath(newRawPath)
  if (oldPath === newPath) return false

  const cachedFolder = await db.driveFolders.get(oldPath)
  if (!cachedFolder?.driveFolderId) return false

  const auth = await getDriveAccessToken()
  if (!auth.ok) {
    throw new Error(auth.message || 'Reconnect Google Drive before renaming this folder.')
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Connect to the internet before renaming this Drive folder.')
  }

  const newFolderName = newPath.split('/').pop()
  await requestDriveUrl(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cachedFolder.driveFolderId)}?fields=id,name`,
    auth.accessToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName }),
    },
  )

  const cachedPaths = await db.driveFolders
    .filter((entry) => entry.path === oldPath || entry.path.startsWith(`${oldPath}/`))
    .toArray()
  await db.transaction('rw', db.driveFolders, async () => {
    for (const entry of cachedPaths) {
      await db.driveFolders.delete(entry.path)
      await db.driveFolders.put({
        ...entry,
        path: `${newPath}${entry.path.slice(oldPath.length)}`,
      })
    }
  })
  return true
}

export function googleClientIdConfigured() {
  return Boolean(getClientId())
}

function restoreSessionAccessToken() {
  if (typeof window === 'undefined') return ''

  try {
    const stored = window.sessionStorage.getItem(SESSION_TOKEN_KEY)
    if (!stored) return ''

    const token = JSON.parse(stored)
    if (
      typeof token.accessToken !== 'string' ||
      !token.accessToken ||
      typeof token.expiresAt !== 'number' ||
      Date.now() >= token.expiresAt
    ) {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY)
      return ''
    }

    tokenState.accessToken = token.accessToken
    tokenState.expiresAt = token.expiresAt
    return tokenState.accessToken
  } catch (error) {
    console.warn('[ClassVault Drive] Could not restore the session token:', error)
    return ''
  }
}

async function persistSessionAccessToken() {
  const storedToken = JSON.stringify({
    accessToken: tokenState.accessToken,
    expiresAt: tokenState.expiresAt,
  })
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, storedToken)
    }
  } catch (error) {
    console.warn('[ClassVault Drive] Could not persist the session token:', error)
  }
  try {
    await db.settings.put({ key: DRIVE_TOKEN_SETTING, value: storedToken })
  } catch (error) {
    console.warn('[ClassVault Drive] Could not make the token available to background sync:', error)
  }
}

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve(true)
      return
    }

    const existing = document.querySelector('script[data-google-gsi]')
    if (existing) {
      const waitForGoogle = () => {
        if (window.google?.accounts?.oauth2) {
          resolve(true)
          return
        }
        setTimeout(waitForGoogle, 200)
      }
      waitForGoogle()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleGsi = 'true'
    script.onload = () => resolve(true)
    script.onerror = () => reject(new Error('Unable to load Google Identity Services script.'))
    document.head.appendChild(script)
  })
}

export async function ensureGoogleAvailable() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, message: 'Google Drive is unavailable while you are offline.' }
  }

  if (!getClientId()) {
    return {
      ok: false,
      message: 'Google Drive is not configured for this build. Add VITE_GOOGLE_CLIENT_ID in Cloudflare Pages settings and redeploy.',
    }
  }

  try {
    await loadGoogleScript()
    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google accounts library did not initialize.')
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error.message || 'Google Drive is unavailable right now.' }
  }
}

export async function requestDriveAccessToken({ forcePrompt = false } = {}) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, message: 'Google Drive is unavailable while you are offline.' }
  }

  const ready = await ensureGoogleAvailable()
  if (!ready.ok) {
    return ready
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, message: 'Google Drive is unavailable while you are offline.' }
  }

  const clientId = getClientId()

  return new Promise((resolve) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: async (response) => {
        if (response.error) {
          resolve({ ok: false, message: response.error_description || response.error || 'Google sign-in failed.' })
          return
        }

        tokenState.accessToken = response.access_token
        tokenState.expiresAt = Date.now() + Math.max((response.expires_in || 3600) - 30, 60) * 1000
        await persistSessionAccessToken()

        resolve({ ok: true, accessToken: response.access_token, expiresAt: tokenState.expiresAt })
      },
      error_callback: (error) => {
        resolve({ ok: false, message: error?.message || 'Failed to get a Google Drive token.' })
      },
    })

    tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' })
  })
}

export function getStoredAccessToken() {
  if (tokenState.accessToken && Date.now() < tokenState.expiresAt) {
    return tokenState.accessToken
  }

  tokenState.accessToken = ''
  tokenState.expiresAt = 0
  return restoreSessionAccessToken()
}

export async function getDriveAccessToken({ forceRefresh = false } = {}) {
  if (forceRefresh) {
    const result = await requestDriveAccessToken({ forcePrompt: true })
    return result.ok
      ? { ok: true, accessToken: result.accessToken }
      : { ok: false, message: result.message }
  }

  const accessToken = getStoredAccessToken()
  if (accessToken) return { ok: true, accessToken }

  const stored = await db.settings.get(DRIVE_TOKEN_SETTING)
  if (stored?.value) {
    try {
      const token = JSON.parse(stored.value)
      if (
        typeof token.accessToken === 'string' &&
        token.accessToken &&
        typeof token.expiresAt === 'number' &&
        Date.now() < token.expiresAt
      ) {
        tokenState.accessToken = token.accessToken
        tokenState.expiresAt = token.expiresAt
        return { ok: true, accessToken: tokenState.accessToken }
      }
    } catch (error) {
      console.warn('[ClassVault Drive] Could not read the background sync token:', error)
    }
    await db.settings.delete(DRIVE_TOKEN_SETTING)
  }

  return {
    ok: false,
    message: 'Reconnect Google Drive to continue. No sign-in window was opened.',
  }
}

function escapeDriveQuery(value) {
  return String(value || '').replace(/'/g, "\\'")
}

function normalizeFolderPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).join('/')
}

function getRootedFolderPath(value) {
  const normalized = normalizeFolderPath(value)
  if (!normalized) {
    return ROOT_FOLDER_NAME
  }
  if (normalized === ROOT_FOLDER_NAME || normalized.startsWith(`${ROOT_FOLDER_NAME}/`)) {
    return normalized
  }
  return `${ROOT_FOLDER_NAME}/${normalized}`
}

async function requestDriveUrl(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Drive request failed (${response.status}): ${text || response.statusText}`)
  }

  return response
}

async function getCachedFolderId(pathKey, accessToken) {
  const cached = await db.driveFolders.get(pathKey)
  if (!cached?.driveFolderId) {
    return null
  }

  try {
    const response = await requestDriveUrl(
      `https://www.googleapis.com/drive/v3/files/${cached.driveFolderId}?fields=id,name,trashed,parents`,
      accessToken,
    )
    const payload = await response.json()

    if (payload.trashed || !payload.id) {
      console.warn(`[ClassVault Drive] cached folder invalid: ${pathKey} (${cached.driveFolderId}) -> cache cleared`)
      await db.driveFolders.delete(pathKey)
      return null
    }

    return payload.id
  } catch (error) {
    const message = error?.message || String(error)
    console.warn(`[ClassVault Drive] cached folder validation failed for ${pathKey} (${cached.driveFolderId}): ${message}`)
    await db.driveFolders.delete(pathKey)
    return null
  }
}

async function findFolderByParent(parentId, folderName, accessToken) {
  const query = `name = '${escapeDriveQuery(folderName)}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`
  const response = await requestDriveUrl(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name,trashed)&orderBy=name`,
    accessToken,
  )

  const payload = await response.json()
  return payload.files?.[0] || null
}

async function createFolder(parentId, folderName, accessToken) {
  const response = await requestDriveUrl(
    'https://www.googleapis.com/drive/v3/files?fields=id,name',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    },
  )
  const created = await response.json()
  return created.id
}

export async function ensureDriveFolderPath(rawFolderPath, accessToken) {
  const fullPath = getRootedFolderPath(rawFolderPath)

  if (inFlightFolderPaths.has(fullPath)) {
    return inFlightFolderPaths.get(fullPath)
  }

  const task = (async () => {
    let parentId = 'root'
    const segments = fullPath.split('/').filter(Boolean)

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      const currentPath = segments.slice(0, index + 1).join('/')
      const cachedId = await getCachedFolderId(currentPath, accessToken)

      if (cachedId) {
        console.log(`[ClassVault Drive] using cached folder: ${currentPath} -> ${cachedId}`)
        parentId = cachedId
        continue
      }

      const existing = await findFolderByParent(parentId, segment, accessToken)
      let folderId = existing?.id

      if (!folderId) {
        folderId = await createFolder(parentId, segment, accessToken)
        console.log(`[ClassVault Drive] created folder: ${currentPath} -> ${folderId}`)
      } else {
        console.log(`[ClassVault Drive] reused folder: ${currentPath} -> ${folderId}`)
      }

      await db.driveFolders.put({ path: currentPath, driveFolderId: folderId })
      parentId = folderId
    }

    console.log(`[ClassVault Drive] resolved folder path: ${fullPath} -> ${parentId}`)
    return parentId
  })()

  inFlightFolderPaths.set(fullPath, task)

  try {
    return await task
  } finally {
    inFlightFolderPaths.delete(fullPath)
  }
}

export async function uploadItemToDrive({ item, folderPath, accessToken }) {
  const folderId = await ensureDriveFolderPath(folderPath, accessToken)
  const safeName = item.fileName || item.title || 'note.txt'
  const contentType = item.mimeType || 'application/octet-stream'
  const payloadBlob = item.blob || new Blob([item.text || ''], { type: contentType })
  const metadata = {
    name: safeName,
    mimeType: contentType,
    description: item.caption || item.text || '',
    appProperties: {
      itemId: String(item.id),
      createdAt: item.createdAt,
      starred: item.starred ? '1' : '0',
      syncStatus: 'synced',
      type: item.type || 'file',
      exam: item.exam || '',
    },
  }

  if (item.driveFileId) {
    const mediaResponse = await requestDriveUrl(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(item.driveFileId)}?uploadType=media&fields=id,name,modifiedTime`,
      accessToken,
      {
        method: 'PATCH',
        headers: { 'Content-Type': contentType },
        body: payloadBlob,
      },
    )
    const mediaResult = await mediaResponse.json()
    const metadataResponse = await requestDriveUrl(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.driveFileId)}?fields=id,name,modifiedTime`,
      accessToken,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      },
    )
    return {
      ...(await metadataResponse.json()),
      modifiedTime: mediaResult.modifiedTime,
      updated: true,
    }
  }

  // Match only this item's Drive metadata so unrelated files are never overwritten.
  const existingQuery = `appProperties has { key='itemId' and value='${escapeDriveQuery(item.id)}' } and '${folderId}' in parents and trashed = false`
  try {
    const checkRes = await requestDriveUrl(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(existingQuery)}&spaces=drive&fields=files(id,name)&pageSize=1`,
      accessToken,
    )
    const checkPayload = await checkRes.json()
    if (checkPayload.files?.length > 0) {
      const existingId = checkPayload.files[0].id
      console.log(`[ClassVault Drive] File "${safeName}" already exists in Drive (${existingId}). Updating existing file instead of creating duplicate.`)
      // Update existing file's media to prevent duplicate files
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&fields=id,name,modifiedTime`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': contentType,
          },
          body: payloadBlob,
        },
      )
      if (updateRes.ok) {
        return { ...(await updateRes.json()), updated: true }
      }
    }
  } catch (err) {
    throw new Error(`Could not check for an existing Drive upload: ${err.message || err}`)
  }

  metadata.parents = [folderId]

  const formData = new FormData()
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  )
  formData.append('file', payloadBlob)

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Upload failed: ${text || response.statusText}`)
  }

  return response.json()
}

/**
 * Downloads a file on demand from Google Drive using files.get?alt=media.
 */
export async function downloadDriveFile(driveFileId, accessToken) {
  if (!driveFileId) {
    throw new Error('Missing Drive file ID')
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Drive download failed (${response.status}): ${text || response.statusText}`)
  }

  return response.blob()
}

/**
 * Delete a file or folder from Google Drive by ID.
 * Deletes a Drive file and reports failures to the caller.
 */
export async function deleteDriveFile(driveFileId, accessToken) {
  if (!driveFileId || !accessToken) {
    throw new Error('A Drive file ID and access token are required to delete this item.')
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Connect to the internet before deleting this Drive item.')
  }
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )
    if (response.ok || response.status === 404) {
      console.log(`[ClassVault Drive] Successfully deleted ${driveFileId} from Google Drive`)
    } else {
      const text = await response.text()
      throw new Error(`Drive delete failed (${response.status}): ${text || response.statusText}`)
    }
  } catch (error) {
    throw error
  }
}

/**
 * Delete a cached Drive folder and its remote Google Drive directory.
 */
export async function deleteDriveFolderByPath(rawFolderPath, accessToken) {
  if (!accessToken) return
  const fullPath = getRootedFolderPath(rawFolderPath)
  const cached = await db.driveFolders.get(fullPath)
  if (cached?.driveFolderId) {
    await deleteDriveFile(cached.driveFolderId, accessToken)
    await db.driveFolders.delete(fullPath)
  }
}

/**
 * Fetch Google Drive account info and storage quota.
 * Fetches Google Drive account details and storage quota.
 */
export async function getDriveAbout(accessToken) {
  if (!accessToken) return null
  try {
    const response = await requestDriveUrl(
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink),storageQuota(limit,usage,usageInDrive)',
      accessToken,
    )
    return await response.json()
  } catch (error) {
    console.warn(`[ClassVault Drive] Failed to get user about info:`, error)
    return null
  }
}

/**
 * List all non-trashed files and folders visible to this app.
 * The restore service filters this list to the ClassVault folder.
 */
export async function listDriveFiles(accessToken) {
  if (!accessToken) {
    throw new Error('Google Drive access token is required to list files.')
  }

  const files = []
  const rootQuery = `name = '${ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`
  const rootResponse = await requestDriveUrl(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(rootQuery)}&spaces=drive&fields=files(id,name,mimeType,parents)&pageSize=100`,
    accessToken,
  )
  const rootFolders = (await rootResponse.json()).files || []
  const queue = rootFolders.map((folder) => folder.id)
  files.push(...rootFolders)

  while (queue.length) {
    const parentId = queue.shift()
    let pageToken = ''
    do {
      const params = new URLSearchParams({
        q: `'${parentId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents,description,appProperties)',
        orderBy: 'folder,name',
        pageSize: '1000',
      })
      if (pageToken) params.set('pageToken', pageToken)

      const response = await requestDriveUrl(
        `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
        accessToken,
      )
      const data = await response.json()
      const children = data.files || []
      files.push(...children)
      queue.push(
        ...children
          .filter((file) => file.mimeType === 'application/vnd.google-apps.folder')
          .map((folder) => folder.id),
      )
      pageToken = data.nextPageToken || ''
    } while (pageToken)
  }

  return files
}
