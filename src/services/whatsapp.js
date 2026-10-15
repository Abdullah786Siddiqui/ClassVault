/**
 * Service to interact with the ClassVault WhatsApp Bot
 */

const ENV_BOT_URL = (import.meta.env.VITE_WHATSAPP_BOT_URL || '').trim().replace(/\/$/, '')
const BASE_URL = ENV_BOT_URL ? `${ENV_BOT_URL}/api` : '/api/whatsapp'
const DIRECT_URL = 'http://localhost:4848/api'

async function apiRequest(endpoint, options = {}) {
  // If an external backend URL is specified via VITE_WHATSAPP_BOT_URL
  if (ENV_BOT_URL) {
    try {
      const res = await fetch(`${ENV_BOT_URL}/api${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      })
      if (res.ok) {
        return await res.json()
      }
    } catch (err) {
      throw new Error('WhatsApp bot server is unreachable.')
    }
  }

  // First attempt via Vite proxy
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    if (res.ok) {
      return await res.json()
    }
  } catch {
    // If proxy fails (e.g. dev server restarted or standalone), fallback to direct port
  }

  try {
    const res = await fetch(`${DIRECT_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    return await res.json()
  } catch (err) {
    throw new Error('WhatsApp Bot is offline or unreachable.')
  }
}

export async function getWhatsAppStatus() {
  try {
    return await apiRequest('/status')
  } catch (err) {
    return { ok: false, status: 'offline', error: err.message }
  }
}

export async function getWhatsAppGroups() {
  try {
    return await apiRequest('/groups')
  } catch (err) {
    return { ok: false, groups: [], error: err.message }
  }
}

export async function getWhatsAppMappings() {
  try {
    return await apiRequest('/mappings')
  } catch (err) {
    return { ok: false, mappings: [], error: err.message }
  }
}

export async function saveWhatsAppMappings(mappings, saveLocalBackup = true) {
  return await apiRequest('/mappings', {
    method: 'POST',
    body: JSON.stringify({ mappings, saveLocalBackup }),
  })
}

export async function requestWhatsAppPairingCode(phoneNumber) {
  return await apiRequest('/pairing-code', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber }),
  })
}

export async function getWhatsAppInbox() {
  try {
    return await apiRequest('/inbox')
  } catch (err) {
    return { ok: false, items: [], error: err.message }
  }
}

export async function ackWhatsAppInbox(ids) {
  try {
    return await apiRequest('/inbox/ack', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function logoutWhatsApp() {
  return await apiRequest('/logout', {
    method: 'POST',
  })
}
