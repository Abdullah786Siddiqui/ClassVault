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
      message: 'Google Drive is not configured yet. Add VITE_GOOGLE_CLIENT_ID to .env.',
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

/**
 * Attempts a silent background token request on startup if user connected before (Fixes B13).
 */
export async function trySilentTokenRestore() {
  const previouslyConnected = await hasPreviouslyConnected()
  if (!previouslyConnected) {
    return { ok: false, silent: true, message: 'Not connected' }
  }

  const googleReady = await ensureGoogleAvailable()
  if (!googleReady.ok) {
    return { ok: false, silent: true, message: googleReady.message }
  }

  // Request token silently without popup (prompt: '')
  const tokenResult = await requestDriveAccessToken({ forcePrompt: false })
  if (tokenResult.ok) {
    return { ok: true, accessToken: tokenResult.accessToken }
  }

  return { ok: false, silent: true, needReconnect: true, message: 'Session expired' }
}

export async function ensureGoogleSignedIn({ forceRefresh = false } = {}) {
  const result = await getDriveAccessToken({ forceRefresh })
  if (!result.ok) {
    return { ok: false, message: result.message }
  }

  return { ok: true, accessToken: result.accessToken }
}
