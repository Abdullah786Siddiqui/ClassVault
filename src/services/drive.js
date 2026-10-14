import db from './db'

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const ROOT_FOLDER_NAME = 'ClassVault'
const STORAGE_TOKEN_KEY = 'classvault.driveAccessToken'
const DRIVE_TOKEN_SETTING = 'classvault.driveAccessToken'
const STORAGE_EMAIL_KEY = 'classvault.userEmail'
const inFlightFolderPaths = new Map()

const tokenState = {
  accessToken: '',
  expiresAt: 0,
}

let refreshTimer = null
const tokenListeners = new Set()

export function onTokenRefreshed(callback) {
  tokenListeners.add(callback)
  return () => tokenListeners.delete(callback)
}

function notifyTokenListeners(data) {
  tokenListeners.forEach((cb) => {
    try {
      cb(data)
    } catch (e) {
      console.warn('[ClassVault Drive] Error in token listener:', e)
    }
  })
}

function getClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
}

export function getStoredUserEmail() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STORAGE_EMAIL_KEY) || window.sessionStorage.getItem(STORAGE_EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

export async function setStoredUserEmail(email) {
  if (!email || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_EMAIL_KEY, email)
    window.sessionStorage.setItem(STORAGE_EMAIL_KEY, email)
  } catch {}
  try {
    await db.settings.put({ key: STORAGE_EMAIL_KEY, value: email })
  } catch {}
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

export function scheduleTokenRefresh(expiresAt) {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }

  if (!expiresAt || typeof window === 'undefined') return

  // Schedule refresh 5 minutes before token expires
  const leadTimeMs = 5 * 60 * 1000
  const delay = Math.max(expiresAt - Date.now() - leadTimeMs, 10000)

  if (delay > 0 && delay < 2 * 60 * 60 * 1000) {
    refreshTimer = setTimeout(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        console.log('[ClassVault Drive] Auto-refreshing token before expiry...')
        try {
          await refreshAccessTokenSilently()
        } catch (e) {
          console.warn('[ClassVault Drive] Auto-refresh failed:', e)
        }
      }
    }, delay)
  }
}

export function restoreStoredAccessToken() {
  if (typeof window === 'undefined') return ''

  // 1. In-memory check
  if (tokenState.accessToken && Date.now() < tokenState.expiresAt) {
    return tokenState.accessToken
  }

  // 2. localStorage check (persists across tab closes, browser restarts and PWA launches)
  try {
    const rawLocal = window.localStorage.getItem(STORAGE_TOKEN_KEY)
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal)
      if (
        typeof parsed.accessToken === 'string' &&
        parsed.accessToken &&
        typeof parsed.expiresAt === 'number' &&
        Date.now() < parsed.expiresAt
      ) {
        tokenState.accessToken = parsed.accessToken
        tokenState.expiresAt = parsed.expiresAt
        scheduleTokenRefresh(parsed.expiresAt)
        return tokenState.accessToken
      }
    }
  } catch (error) {
    console.warn('[ClassVault Drive] Could not restore token from localStorage:', error)
  }

  // 3. sessionStorage check
  try {
    const rawSession = window.sessionStorage.getItem(STORAGE_TOKEN_KEY)
    if (rawSession) {
      const parsed = JSON.parse(rawSession)
      if (
        typeof parsed.accessToken === 'string' &&
        parsed.accessToken &&
        typeof parsed.expiresAt === 'number' &&
        Date.now() < parsed.expiresAt
      ) {
        tokenState.accessToken = parsed.accessToken
        tokenState.expiresAt = parsed.expiresAt
        scheduleTokenRefresh(parsed.expiresAt)
        return tokenState.accessToken
      }
    }
  } catch (error) {
    console.warn('[ClassVault Drive] Could not restore token from sessionStorage:', error)
  }

  tokenState.accessToken = ''
  tokenState.expiresAt = 0
  return ''
}

export async function restoreStoredAccessTokenAsync() {
  const syncToken = restoreStoredAccessToken()
  if (syncToken) return syncToken

  try {
    const stored = await db.settings.get(DRIVE_TOKEN_SETTING)
    if (stored?.value) {
      const parsed = JSON.parse(stored.value)
      if (
        typeof parsed.accessToken === 'string' &&
        parsed.accessToken &&
        typeof parsed.expiresAt === 'number' &&
        Date.now() < parsed.expiresAt
      ) {
        tokenState.accessToken = parsed.accessToken
        tokenState.expiresAt = parsed.expiresAt
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_TOKEN_KEY, stored.value)
          }
        } catch {}
        scheduleTokenRefresh(parsed.expiresAt)
        return tokenState.accessToken
      }
    }
  } catch (error) {
    console.warn('[ClassVault Drive] Could not restore token from db.settings:', error)
  }

  return ''
}

export async function persistAccessToken(accessToken, expiresAt) {
  tokenState.accessToken = accessToken
  tokenState.expiresAt = expiresAt

  const payload = JSON.stringify({ accessToken, expiresAt })

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_TOKEN_KEY, payload)
    } catch (e) {
      console.warn('[ClassVault Drive] localStorage set failed:', e)
    }
    try {
      window.sessionStorage.setItem(STORAGE_TOKEN_KEY, payload)
    } catch (e) {
      console.warn('[ClassVault Drive] sessionStorage set failed:', e)
    }
  }

  try {
    await db.settings.put({ key: DRIVE_TOKEN_SETTING, value: payload })
  } catch (e) {
    console.warn('[ClassVault Drive] IndexedDB token save failed:', e)
  }

  scheduleTokenRefresh(expiresAt)
  notifyTokenListeners({ accessToken, expiresAt })

  // Asynchronously query and store user email to use as login_hint for silent renewals
  fetchAndStoreUserEmail(accessToken).catch(() => undefined)
}

async function fetchAndStoreUserEmail(accessToken) {
  try {
    const about = await getDriveAbout(accessToken)
    const email = about?.user?.emailAddress
    if (email) {
      await setStoredUserEmail(email)
    }
  } catch (e) {
    console.warn('[ClassVault Drive] Could not fetch user email for login hint:', e)
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

export async function requestDriveAccessToken({ prompt, forcePrompt = false, loginHint } = {}) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, message: 'Google Drive is unavailable while you are offline.' }
  }

  const ready = await ensureGoogleAvailable()
  if (!ready.ok) {
    return ready
  }

  const clientId = getClientId()
  const emailHint = loginHint || getStoredUserEmail()

  let promptValue = ''
  if (prompt !== undefined) {
    promptValue = prompt
  } else if (forcePrompt) {
    promptValue = 'consent'
  }

  return new Promise((resolve) => {
    let settled = false
    let timeoutId = null

    // For silent requests ('none'), set a 10s safety timeout in case the response doesn't arrive
    if (promptValue === 'none') {
      timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true
          resolve({ ok: false, error: 'timeout', message: 'Silent token renewal timed out.' })
        }
      }, 10000)
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: async (response) => {
        if (settled) return
        settled = true
        if (timeoutId) clearTimeout(timeoutId)

        if (response.error) {
          resolve({
            ok: false,
            error: response.error,
            message: response.error_description || response.error || 'Google sign-in failed.',
          })
          return
        }

        const expiresAt = Date.now() + Math.max((response.expires_in || 3600) - 30, 60) * 1000
        await persistAccessToken(response.access_token, expiresAt)

        resolve({ ok: true, accessToken: response.access_token, expiresAt })
      },
      error_callback: (error) => {
        if (settled) return
        settled = true
        if (timeoutId) clearTimeout(timeoutId)
        resolve({
          ok: false,
          error: error?.type || 'error',
          message: error?.message || 'Failed to get a Google Drive token.',
        })
      },
    })

    const requestOptions = {
      prompt: promptValue,
      ...(emailHint ? { login_hint: emailHint } : {}),
    }

    try {
      tokenClient.requestAccessToken(requestOptions)
    } catch (err) {
      if (settled) return
      settled = true
      if (timeoutId) clearTimeout(timeoutId)
      resolve({ ok: false, error: err?.name, message: err?.message || 'Error requesting token.' })
    }
  })
}

export async function refreshAccessTokenSilently() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, message: 'Google Drive is unavailable while you are offline.' }
  }
  const email = getStoredUserEmail()
  return requestDriveAccessToken({ prompt: 'none', loginHint: email })
}

export function getStoredAccessToken() {
  return restoreStoredAccessToken()
}

export async function getDriveAccessToken({ forceRefresh = false, silentOnly = false } = {}) {
  if (forceRefresh) {
    const result = await requestDriveAccessToken({ prompt: '' })
    return result.ok
      ? { ok: true, accessToken: result.accessToken }
      : { ok: false, message: result.message }
  }

  // 1. Check synchronous storage (memory, localStorage, sessionStorage)
  const accessToken = getStoredAccessToken()
  if (accessToken) return { ok: true, accessToken }

  // 2. Fallback check to IndexedDB
  try {
    const stored = await db.settings.get(DRIVE_TOKEN_SETTING)
    if (stored?.value) {
      const token = JSON.parse(stored.value)
      if (
        typeof token.accessToken === 'string' &&
        token.accessToken &&
        typeof token.expiresAt === 'number' &&
        Date.now() < token.expiresAt
      ) {
        await persistAccessToken(token.accessToken, token.expiresAt)
        return { ok: true, accessToken: token.accessToken }
      }
    }
  } catch (error) {
    console.warn('[ClassVault Drive] Could not read background sync token:', error)
  }

  // 3. If online and student has previously connected, attempt silent renewal!
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    const connectedSetting = await db.settings.get('hasConnectedGoogle')
    const previouslyConnected = connectedSetting?.value === 'true'
    if (previouslyConnected) {
      console.log('[ClassVault Drive] Token expired or not in memory. Attempting silent renewal...')
      const silentResult = await refreshAccessTokenSilently()
      if (silentResult.ok) {
        return { ok: true, accessToken: silentResult.accessToken }
      }
    }
  }

  if (silentOnly) {
    return { ok: false, message: 'Silent refresh not possible.' }
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

async function requestDriveUrl(url, accessToken, options = {}, isRetry = false) {
  let token = accessToken || getStoredAccessToken()
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  })

  // Self-heal on 401 Unauthorized: silently refresh token and retry once
  if (response.status === 401 && !isRetry && typeof navigator !== 'undefined' && navigator.onLine) {
    console.warn('[ClassVault Drive] 401 received. Attempting silent token refresh and retry...')
    const refreshed = await refreshAccessTokenSilently()
    if (refreshed.ok && refreshed.accessToken) {
      return requestDriveUrl(url, refreshed.accessToken, options, true)
    }
  }

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
      let updateRes = await fetch(
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
      if (updateRes.status === 401 && typeof navigator !== 'undefined' && navigator.onLine) {
        const refreshed = await refreshAccessTokenSilently()
        if (refreshed.ok && refreshed.accessToken) {
          updateRes = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&fields=id,name,modifiedTime`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${refreshed.accessToken}`,
                'Content-Type': contentType,
              },
              body: payloadBlob,
            },
          )
        }
      }
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

  let uploadToken = accessToken
  let response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${uploadToken}`,
      },
      body: formData,
    },
  )

  if (response.status === 401 && typeof navigator !== 'undefined' && navigator.onLine) {
    const refreshed = await refreshAccessTokenSilently()
    if (refreshed.ok && refreshed.accessToken) {
      uploadToken = refreshed.accessToken
      response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${uploadToken}`,
          },
          body: formData,
        },
      )
    }
  }

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

  let token = accessToken
  let response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (response.status === 401 && typeof navigator !== 'undefined' && navigator.onLine) {
    const refreshed = await refreshAccessTokenSilently()
    if (refreshed.ok && refreshed.accessToken) {
      token = refreshed.accessToken
      response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )
    }
  }

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
    let token = accessToken
    let response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    if (response.status === 401 && typeof navigator !== 'undefined' && navigator.onLine) {
      const refreshed = await refreshAccessTokenSilently()
      if (refreshed.ok && refreshed.accessToken) {
        token = refreshed.accessToken
        response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        )
      }
    }

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

// Automatically check and refresh token on tab visibility and network restore
if (typeof window !== 'undefined') {
  const checkTokenExpiryAndRenew = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      if (tokenState.accessToken && Date.now() >= tokenState.expiresAt - 5 * 60 * 1000) {
        refreshAccessTokenSilently().catch(() => undefined)
      } else if (!tokenState.accessToken) {
        restoreStoredAccessToken()
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkTokenExpiryAndRenew()
    }
  })

  window.addEventListener('online', checkTokenExpiryAndRenew)
}
