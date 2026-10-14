import db from './db'
import {
  ensureGoogleAvailable,
  getDriveAccessToken,
  googleClientIdConfigured,
  requestDriveAccessToken,
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

export async function connectGoogleDrive({ forcePrompt = false } = {}) {
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

  const tokenResult = await requestDriveAccessToken({ forcePrompt })
  if (!tokenResult.ok) {
    return tokenResult
  }

  // Remember that the student has connected before (Fixes B13)
  await setPreviouslyConnected(true)

  return {
    ok: true,
    message: 'Google Drive is connected and ready to sync.',
    accessToken: tokenResult.accessToken,
  }
}

export async function ensureGoogleSignedIn({ forceRefresh = false } = {}) {
  const result = await getDriveAccessToken({ forceRefresh })
  if (!result.ok) {
    return { ok: false, message: result.message }
  }

  return { ok: true, accessToken: result.accessToken }
}
