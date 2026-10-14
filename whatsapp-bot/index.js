import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import QRCode from 'qrcode'
import { getDriveClient, uploadBufferToDrive } from './drive.js'

const PORT = process.env.PORT || 4848
const CONFIG_PATH = path.resolve('config.json')
const AUTH_DIR = path.resolve('auth_session')

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      mappings: [],
      saveLocalBackup: true,
      localBackupDir: './downloads',
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf8')
    return defaultConfig
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch {
    return { mappings: [], saveLocalBackup: true, localBackupDir: './downloads' }
  }
}

function saveConfig(newConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8')
  config = newConfig
}

let config = loadConfig()

let drive = getDriveClient()
if (drive) {
  console.log('[ClassVault Bot] Google Drive connected! Incoming media will be uploaded to Drive.')
} else {
  console.log('[ClassVault Bot] Google Drive not yet authenticated. Media will be saved locally to ./downloads/ folder.')
  console.log('[ClassVault Bot] (Run "npm run auth-drive" to connect Google Drive)')
}

// Bot state
let sock = null
let botState = {
  status: 'disconnected', // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
  qr: null,
  user: null,
}
let cachedGroups = []

async function refreshGroups() {
  if (!sock || botState.status !== 'connected') {
    cachedGroups = []
    return []
  }
  try {
    const groups = await sock.groupFetchAllParticipating()
    cachedGroups = Object.entries(groups).map(([id, meta]) => ({
      id,
      name: meta.subject || 'Unnamed Group',
      participantsCount: Array.isArray(meta.participants) ? meta.participants.length : 0,
    }))
    // Sort alphabetically by name
    cachedGroups.sort((a, b) => a.name.localeCompare(b.name))
    return cachedGroups
  } catch (err) {
    console.warn('[ClassVault Bot] Failed to fetch groups:', err.message)
    return cachedGroups
  }
}

async function startBot() {
  botState.status = 'connecting'
  botState.qr = null

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      try {
        botState.qr = await QRCode.toDataURL(qr, { margin: 2, scale: 8 })
        botState.status = 'qr_ready'
        console.log('[ClassVault Bot] QR code generated. Ready to scan from ClassVault Web App!')
      } catch (err) {
        console.error('[ClassVault Bot] Error converting QR to data URL:', err)
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      botState.status = 'disconnected'
      botState.qr = null
      botState.user = null
      console.log(`[ClassVault Bot] Connection closed (code: ${statusCode}). Reconnect: ${shouldReconnect}`)

      if (shouldReconnect) {
        setTimeout(() => {
          startBot()
        }, 3000)
      }
    } else if (connection === 'open') {
      botState.status = 'connected'
      botState.qr = null
      botState.user = sock.user || { name: 'WhatsApp User' }
      console.log(`[ClassVault Bot] WhatsApp Connected successfully as ${sock.user?.name || sock.user?.id || 'User'}!`)
      refreshGroups()
    }
  })

  // Listen for media in groups
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue

      const remoteJid = msg.key.remoteJid || ''
      if (!remoteJid.endsWith('@g.us')) continue

      let groupName = ''
      try {
        const groupMeta = await sock.groupMetadata(remoteJid)
        groupName = groupMeta.subject || ''
      } catch {
        groupName = ''
      }

      // Match either by remoteJid (groupId) or by groupName
      const mapping = config.mappings.find(
        (m) =>
          (m.groupId && m.groupId === remoteJid) ||
          (m.groupName && groupName && m.groupName.trim().toLowerCase() === groupName.trim().toLowerCase()),
      )

      if (!mapping) continue

      const messageContent = msg.message
      const isImage = Boolean(messageContent.imageMessage)
      const isDocument = Boolean(messageContent.documentMessage)

      if (!isImage && !isDocument) continue

      const mediaType = isImage ? 'image' : 'document'
      const mediaMsg = isImage ? messageContent.imageMessage : messageContent.documentMessage
      const caption = mediaMsg.caption || ''
      const mimeType = mediaMsg.mimetype || (isImage ? 'image/jpeg' : 'application/octet-stream')

      const ext = mimeType.split('/')[1]?.split(';')[0] || (isImage ? 'jpg' : 'bin')
      const fileName =
        mediaMsg.fileName ||
        `wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`

      console.log(`\n[ClassVault Bot] Incoming ${mediaType} from group "${groupName || remoteJid}"!`)
      console.log(` -> File: ${fileName}`)
      console.log(` -> Destination: ${mapping.semester} / ${mapping.exam} / ${mapping.subject}`)

      try {
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            logger: pino({ level: 'silent' }),
            reuploadRequest: sock.updateMediaMessage,
          },
        )

        // 1. Local backup
        if (config.saveLocalBackup) {
          const targetDir = path.resolve(
            config.localBackupDir || './downloads',
            mapping.semester,
            mapping.exam,
            mapping.subject,
          )
          fs.mkdirSync(targetDir, { recursive: true })
          fs.writeFileSync(path.join(targetDir, fileName), buffer)
          console.log(`[ClassVault Bot] Saved backup: ${targetDir}/${fileName}`)
        }

        // 2. Google Drive upload
        if (drive) {
          const uploadRes = await uploadBufferToDrive({
            drive,
            buffer,
            fileName,
            mimeType,
            semester: mapping.semester,
            exam: mapping.exam,
            subject: mapping.subject,
            caption,
          })
          console.log(`[ClassVault Bot] Uploaded to Drive successfully! File ID: ${uploadRes.id}`)
        }
      } catch (err) {
        console.error('[ClassVault Bot] Media download/upload failed:', err.message)
      }
    }
  })
}

// -------------------------------------------------------------
// HTTP API Server (exposes status, QR code, groups, and mappings)
// -------------------------------------------------------------
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res)
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const pathname = url.pathname.replace(/^\/api\/whatsapp/, '/api') // Normalize path

  // 1. Status & QR Code
  if (req.method === 'GET' && pathname === '/api/status') {
    return sendJson(res, 200, {
      ok: true,
      status: botState.status,
      qr: botState.qr,
      user: botState.user,
      hasDrive: Boolean(drive),
    })
  }

  // 2. List Participating WhatsApp Groups
  if (req.method === 'GET' && pathname === '/api/groups') {
    if (botState.status !== 'connected') {
      return sendJson(res, 200, { ok: false, error: 'WhatsApp is not connected yet', groups: [] })
    }
    const groups = await refreshGroups()
    return sendJson(res, 200, { ok: true, groups })
  }

  // 3. Get Mappings
  if (req.method === 'GET' && pathname === '/api/mappings') {
    return sendJson(res, 200, {
      ok: true,
      mappings: config.mappings || [],
      saveLocalBackup: config.saveLocalBackup ?? true,
      localBackupDir: config.localBackupDir || './downloads',
    })
  }

  // 4. Update Mappings
  if (req.method === 'POST' && pathname === '/api/mappings') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}')
        if (Array.isArray(payload.mappings)) {
          config.mappings = payload.mappings
        }
        if (typeof payload.saveLocalBackup === 'boolean') {
          config.saveLocalBackup = payload.saveLocalBackup
        }
        saveConfig(config)
        console.log(`[ClassVault Bot] Mappings updated via Web App (${config.mappings.length} mapping(s))`)
        return sendJson(res, 200, { ok: true, mappings: config.mappings })
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message })
      }
    })
    return
  }

  // 5. Disconnect / Logout
  if (req.method === 'POST' && pathname === '/api/logout') {
    try {
      if (sock) {
        await sock.logout().catch(() => undefined)
      }
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true })
      }
      botState.status = 'disconnected'
      botState.qr = null
      botState.user = null
      cachedGroups = []
      setTimeout(() => startBot(), 1000)
      return sendJson(res, 200, { ok: true, message: 'Logged out successfully' })
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message })
    }
  }

  // Not found
  return sendJson(res, 404, { ok: false, error: 'Endpoint not found' })
})

server.listen(PORT, () => {
  console.log(`\n======================================================`)
  console.log(` [ClassVault Bot] Server is running on http://localhost:${PORT}`)
  console.log(` Scan QR code and manage mappings in the ClassVault Web App!`)
  console.log(`======================================================\n`)
  startBot().catch((err) => console.error('[ClassVault Bot] Startup error:', err))
})
