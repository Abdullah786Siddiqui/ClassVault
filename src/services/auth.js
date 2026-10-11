import db from './db'
import {
  ensureGoogleAvailable,
  getDriveAccessToken,
  googleClientIdConfigured,
  requestDriveAccessToken,
} from './drive'

const SETTING_CONNECTED = 'hasConnectedGoogle'

export async function hasPreviouslyConnected() {
  const setting = await db.settings.get(SETTING_CONNECTED)
  return setting?.value === 'true'
}

export async function setPreviouslyConnected(connected) {
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
