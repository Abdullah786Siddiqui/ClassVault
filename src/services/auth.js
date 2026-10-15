import db from './db'
import {
  ensureGoogleAvailable,
  getDriveAccessToken,
  googleClientIdConfigured,
  requestDriveAccessToken,
  fetchGoogleUserProfile,
  clearStoredAuth,
} from './drive'

const SETTING_CONNECTED = 'hasConnectedGoogle'

export async function hasPreviouslyConnected() {
  if (typeof window !== 'undefined') {
    const local = window.localStorage.getItem(SETTING_CONNECTED)
    if (local === 'true') return true
  }
  const setting = await db.settings.get(SETTING_CONNECTED)
  if (setting?.value === 'true') {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SETTING_CONNECTED, 'true')
      } catch {}
    }
    return true
  }
  return false
}

export async function setPreviouslyConnected(connected) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SETTING_CONNECTED, connected ? 'true' : 'false')
    } catch {}
  }
  await db.settings.put({
    key: SETTING_CONNECTED,
    value: connected ? 'true' : 'false',
  })
}

export async function connectGoogleDrive({ forcePrompt = false, selectAccount = false } = {}) {
  if (!googleClientIdConfigured()) {
    return {
      ok: false,
      message: 'Google Drive is not configured for this build. Add VITE_GOOGLE_CLIENT_ID in Cloudflare Pages settings and redeploy.',
    }
  }

  const googleReady = await ensureGoogleAvailable()
  if (!googleReady.ok) {
    return googleReady
  }

  const tokenResult = await requestDriveAccessToken({ forcePrompt, selectAccount })
  if (!tokenResult.ok) {
    return tokenResult
  }

  // Remember that the student has connected before
  await setPreviouslyConnected(true)

  // Fetch the Google account profile (displayName, emailAddress, photoLink)
  const userProfile = await fetchGoogleUserProfile(tokenResult.accessToken)

  return {
    ok: true,
    message: 'Google Drive is connected and ready to sync.',
    accessToken: tokenResult.accessToken,
    user: userProfile,
  }
}

export async function switchGoogleDriveAccount() {
  await clearStoredAuth()
  return await connectGoogleDrive({ forcePrompt: true, selectAccount: true })
}

export async function disconnectGoogleDrive() {
  const account = await db.settings.get('classvault.userAccount').catch(() => null)
  let email = ''
  try {
    if (account?.value) email = JSON.parse(account.value)?.email || ''
  } catch {}

  await clearStoredAuth()
  await setPreviouslyConnected(false)

  // Clear all synced data from local storage so nothing lingers on device
  // (Offline pending items are preserved so user doesn't lose newly captured work)
  try {
    const syncedItems = await db.items
      .filter((i) => i.syncStatus === 'synced' && (!email || i.userEmail === email))
      .toArray()

    await db.transaction('rw', db.items, db.filesCache, db.driveFolders, async () => {
      for (const item of syncedItems) {
        await db.items.delete(item.id)
        if (item.driveFileId) {
          await db.filesCache.delete(item.driveFileId)
        }
      }
      await db.driveFolders.clear()
    })

    // Prune semesters and subjects that have no pending items
    const remainingItems = await db.items.toArray()
    const activeSubIds = new Set(remainingItems.map((i) => Number(i.subjectId)))
    const activeSemIds = new Set(remainingItems.map((i) => Number(i.semesterId)))

    const subjects = await db.subjects.filter((s) => !email || s.userEmail === email).toArray()
    for (const sub of subjects) {
      if (!activeSubIds.has(Number(sub.id))) {
        await db.subjects.delete(sub.id)
      }
    }

    const semesters = await db.semesters.filter((s) => !email || s.userEmail === email).toArray()
    for (const sem of semesters) {
      if (!activeSemIds.has(Number(sem.id))) {
        await db.semesters.delete(sem.id)
      }
    }
  } catch (err) {
    console.warn('[ClassVault Auth] Cleanup on disconnect error:', err)
  }

  return { ok: true }
}

export async function ensureGoogleSignedIn({ forceRefresh = false } = {}) {
  const result = await getDriveAccessToken({ forceRefresh })
  if (!result.ok) {
    return { ok: false, message: result.message }
  }

  return { ok: true, accessToken: result.accessToken }
}
