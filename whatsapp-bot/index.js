import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import QRCode from 'qrcode'
import { getDriveClient, uploadBufferToDrive } from './drive.js'

const PORT = process.env.PORT || 4848
const CONFIG_PATH = path.resolve('config.json')
const AUTH_DIR = path.resolve('auth_session')

// ----------------------------------------------------------
// Config helpers
// ----------------------------------------------------------
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const def = { mappings: [], saveLocalBackup: true, localBackupDir: './downloads' }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(def, null, 2), 'utf8')
    return def
  }
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }
  catch { return { mappings: [], saveLocalBackup: true, localBackupDir: './downloads' } }
}

function saveConfig(c) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2), 'utf8')
  config = c
}

let config = loadConfig()

const INBOX_PATH = path.resolve('inbox.json')
function loadInbox() {
  if (!fs.existsSync(INBOX_PATH)) return []
  try { return JSON.parse(fs.readFileSync(INBOX_PATH, 'utf8')) }
  catch { return [] }
}
function saveInbox(items) {
  try { fs.writeFileSync(INBOX_PATH, JSON.stringify(items, null, 2), 'utf8') } catch {}
}
let inbox = loadInbox()

// ----------------------------------------------------------
// Google Drive
// ----------------------------------------------------------
let drive = getDriveClient()
console.log(drive
  ? '[Bot] Google Drive: connected'
  : '[Bot] Google Drive: not authenticated (files saved locally)'
)

// ----------------------------------------------------------
// Bot state
// ----------------------------------------------------------
let sock = null
let retryCount = 0
const MAX_RETRY = 8          // give up after 8 consecutive failures (logged-out or bad creds)
let retryTimer = null

let botState = {
  status: 'connecting',      // connecting | qr_ready | connected | disconnected
  qr: null,
  user: null,
  hasDrive: Boolean(drive),
}
let cachedGroups = []

async function refreshGroups() {
  if (!sock || botState.status !== 'connected') return cachedGroups
  try {
    const raw = await sock.groupFetchAllParticipating()
    cachedGroups = Object.entries(raw).map(([id, m]) => ({
      id,
      name: m.subject || 'Unnamed Group',
      participantsCount: Array.isArray(m.participants) ? m.participants.length : 0,
    })).sort((a, b) => a.name.localeCompare(b.name))
  } catch (e) {
    console.warn('[Bot] Could not fetch groups:', e.message)
  }
  return cachedGroups
}

// ----------------------------------------------------------
// WhatsApp connection
// ----------------------------------------------------------
async function startBot() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }

  botState.status = 'connecting'
  botState.qr = null

  let state, saveCreds
  try {
    const authState = await useMultiFileAuthState(AUTH_DIR)
    state = authState.state
    saveCreds = authState.saveCreds
  } catch (err) {
    console.error('[Bot] Could not load auth state:', err.message)
    scheduleRetry()
    return
  }

  let { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    connectTimeoutMs: 20_000,
    defaultQueryTimeoutMs: 20_000,
    keepAliveIntervalMs: 15_000,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      try {
        botState.qr = await QRCode.toDataURL(qr, { margin: 2, scale: 8 })
        botState.status = 'qr_ready'
        retryCount = 0
      } catch (e) {
        console.error('[Bot] QR generation error:', e.message)
      }
    }

    if (connection === 'open') {
      retryCount = 0
      botState.status = 'connected'
      botState.qr = null
      botState.user = sock.user || null
      console.log(`[Bot] WhatsApp connected as ${sock.user?.name || sock.user?.id || '?'}`)
      refreshGroups()
    }

    if (connection === 'close') {
      botState.status = 'disconnected'
      botState.qr = null
      botState.user = null

      const code = lastDisconnect?.error?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut
      console.log(`[Bot] Connection closed — code: ${code ?? 'unknown'}`)

      if (loggedOut) {
        console.log('[Bot] Logged out. Clearing session so fresh QR can be shown.')
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }) } catch { /* ok */ }
        retryCount = 0
        scheduleRetry(2000)  // start fresh immediately
      } else if (retryCount < MAX_RETRY) {
        const delay = Math.min(2000 * 2 ** retryCount, 60_000)  // exponential back-off max 60s
        console.log(`[Bot] Reconnecting in ${delay / 1000}s (attempt ${retryCount + 1}/${MAX_RETRY})`)
        retryCount++
        scheduleRetry(delay)
      } else {
        console.error('[Bot] Too many reconnect failures. Waiting 2 minutes before trying again.')
        retryCount = 0
        scheduleRetry(120_000)
      }
    }
  })

  // Listen for group media
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      await handleIncomingMessage(msg)
    }
  })
}

function scheduleRetry(delay = 5000) {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => startBot().catch(console.error), delay)
}

// ----------------------------------------------------------
// Incoming media handler
// ----------------------------------------------------------
async function handleIncomingMessage(msg) {
  try {
    if (!msg.message) return
    const remoteJid = msg.key.remoteJid || ''
    if (!remoteJid.endsWith('@g.us')) return   // only group messages

    // Find matching mapping — prefer groupId match, fallback to groupName
    const mapping = config.mappings.find(m =>
      (m.groupId && m.groupId === remoteJid) ||
      (m.groupName && remoteJid.includes(m.groupName))
    )

    // Also try fetching group name for name-based matching
    let mapping2 = mapping
    if (!mapping2) {
      try {
        const meta = await sock.groupMetadata(remoteJid)
        const gName = (meta.subject || '').trim().toLowerCase()
        mapping2 = config.mappings.find(m =>
          m.groupName && m.groupName.trim().toLowerCase() === gName
        )
      } catch { /* ignore */ }
    }

    if (!mapping2) return  // not a monitored group

    // Unwrap ephemeral, viewOnce, or captioned documents
    let mc = msg.message
    if (!mc) return
    if (mc.ephemeralMessage) mc = mc.ephemeralMessage.message
    if (mc.viewOnceMessage) mc = mc.viewOnceMessage.message
    if (mc.viewOnceMessageV2) mc = mc.viewOnceMessageV2.message
    if (mc.documentWithCaptionMessage) mc = mc.documentWithCaptionMessage.message

    const isImage = Boolean(mc.imageMessage)
    const isDoc   = Boolean(mc.documentMessage)
    const isText  = Boolean(mc.conversation || mc.extendedTextMessage)

    // Respect per-mapping content-type filters
    const allowImages = mapping2.allowImages !== false
    const allowFiles  = mapping2.allowFiles  !== false
    const allowText   = mapping2.allowText   === true   // text disabled by default

    if (isText && allowText) {
      const text = mc.conversation || mc.extendedTextMessage?.text || ''
      if (!text.trim()) return
      console.log(`[Bot] Text message from "${mapping2.groupName}" → ${mapping2.subject}`)
    }

    if (!isImage && !isDoc) return
    if (isImage && !allowImages) return
    if (isDoc && !allowFiles) return

    const mediaMsg = isImage ? mc.imageMessage : mc.documentMessage
    const mimeType = mediaMsg.mimetype || (isImage ? 'image/jpeg' : 'application/octet-stream')
    const ext = mimeType.split('/')[1]?.split(';')[0] || (isImage ? 'jpg' : 'bin')
    const caption = mediaMsg.caption || ''
    const fileName = mediaMsg.fileName || `WA_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`

    console.log(`[Bot] Received ${isImage ? 'image' : 'file'} "${fileName}" for ${mapping2.semester} / ${mapping2.exam} / ${mapping2.subject}`)

    const buffer = await downloadMediaMessage(
      { key: msg.key, message: mc },
      'buffer',
      {},
      {
        logger: pino({ level: 'silent' }),
        reuploadRequest: sock.updateMediaMessage,
      }
    )

    // Local disk backup
    if (config.saveLocalBackup) {
      const dir = path.resolve(config.localBackupDir || './downloads', mapping2.semester, mapping2.exam, mapping2.subject)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, fileName), buffer)
      console.log(`[Bot] Saved locally: ${dir}/${fileName}`)
    }

    // Google Drive backup
    if (drive) {
      const r = await uploadBufferToDrive({ drive, buffer, fileName, mimeType,
        semester: mapping2.semester, exam: mapping2.exam, subject: mapping2.subject, caption })
      console.log(`[Bot] Uploaded to Drive: ${r.id}`)
    }

    // Deliver to ClassVault web app inbox
    const inboxItem = {
      id: msg.key.id || `wa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      semesterId: mapping2.semesterId,
      subjectId: mapping2.subjectId,
      semester: mapping2.semester,
      exam: mapping2.exam,
      subject: mapping2.subject,
      groupName: mapping2.groupName,
      type: isImage ? 'image' : (isDoc ? 'file' : 'text'),
      title: caption || fileName,
      caption: caption || '',
      fileName: fileName,
      mimeType: mimeType,
      base64: buffer.toString('base64'),
      fileSize: buffer.length,
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
    }
    inbox.push(inboxItem)
    if (inbox.length > 100) inbox = inbox.slice(-100)
    saveInbox(inbox)
    console.log(`[Bot] Queued in inbox for ClassVault app: "${fileName}" (total in inbox: ${inbox.length})`)
  } catch (err) {
    console.error('[Bot] Error handling message:', err.message)
  }
}

// ----------------------------------------------------------
// HTTP API Server
// ----------------------------------------------------------
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function json(res, code, data) {
  cors(res)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', d => raw += d)
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch(e) { reject(e) } })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // Normalise both /api/... and /api/whatsapp/...
  const url  = new URL(req.url, `http://localhost:${PORT}`)
  const p    = url.pathname.replace(/^\/api\/whatsapp/, '/api')
  const meth = req.method

  try {
    // GET /api/status
    if (meth === 'GET' && p === '/api/status') {
      return json(res, 200, { ok: true, ...botState })
    }

    // GET /api/groups
    if (meth === 'GET' && p === '/api/groups') {
      if (botState.status !== 'connected')
        return json(res, 200, { ok: false, groups: [], error: 'Not connected yet' })
      const groups = await refreshGroups()
      return json(res, 200, { ok: true, groups })
    }

    // GET /api/mappings
    if (meth === 'GET' && p === '/api/mappings') {
      return json(res, 200, { ok: true, mappings: config.mappings, saveLocalBackup: config.saveLocalBackup })
    }

    // POST /api/mappings
    if (meth === 'POST' && p === '/api/mappings') {
      const body = await readBody(req)
      if (Array.isArray(body.mappings)) config.mappings = body.mappings
      if (typeof body.saveLocalBackup === 'boolean') config.saveLocalBackup = body.saveLocalBackup
      saveConfig(config)
      console.log(`[Bot] Mappings updated (${config.mappings.length} entries)`)
      return json(res, 200, { ok: true, mappings: config.mappings })
    }

    // POST /api/pairing-code (Link with phone number - no 2nd phone or camera needed)
    if (meth === 'POST' && p === '/api/pairing-code') {
      const body = await readBody(req)
      let phone = String(body.phoneNumber || '').trim().replace(/[^0-9]/g, '')
      if (phone.startsWith('0') && phone.length === 11) {
        phone = '92' + phone.slice(1) // Convert local Pakistani 0300... to 92300...
      }
      if (!phone || phone.length < 9) {
        return json(res, 400, { ok: false, error: 'Please enter a valid phone number with country code' })
      }
      if (!sock) {
        return json(res, 500, { ok: false, error: 'WhatsApp service is initializing. Please wait a moment.' })
      }
      try {
        console.log(`[Bot] Requesting pairing code for phone: ${phone}`)
        const code = await sock.requestPairingCode(phone)
        const formatted = code ? code.match(/.{1,4}/g)?.join('-') : code
        console.log(`[Bot] Pairing code generated: ${formatted}`)
        return json(res, 200, { ok: true, code: formatted, rawCode: code })
      } catch (err) {
        console.error('[Bot] Pairing code error:', err.message)
        return json(res, 500, { ok: false, error: err.message || 'Failed to request pairing code' })
      }
    }

    // GET /api/inbox (or /api/sync/inbox)
    if (meth === 'GET' && (p === '/api/inbox' || p === '/api/sync/inbox')) {
      return json(res, 200, { ok: true, items: inbox })
    }

    // POST /api/inbox/ack (or /api/sync/ack)
    if (meth === 'POST' && (p === '/api/inbox/ack' || p === '/api/sync/ack')) {
      const body = await readBody(req)
      const ackIds = new Set(Array.isArray(body.ids) ? body.ids : [])
      inbox = inbox.filter(item => !ackIds.has(item.id))
      saveInbox(inbox)
      return json(res, 200, { ok: true, remaining: inbox.length })
    }

    // POST /api/logout
    if (meth === 'POST' && p === '/api/logout') {
      try { if (sock) await sock.logout().catch(() => {}) } catch { /* ok */ }
      try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }) } catch { /* ok */ }
      botState = { status: 'disconnected', qr: null, user: null, hasDrive: Boolean(drive) }
      cachedGroups = []
      retryCount = 0
      scheduleRetry(1000)
      return json(res, 200, { ok: true })
    }

    return json(res, 404, { ok: false, error: 'Not found' })
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message })
  }
})

server.listen(PORT, () => {
  console.log(`[Bot] API server running at http://localhost:${PORT}`)
  console.log(`[Bot] Open ClassVault → click a Subject → tap WhatsApp button to link groups!`)
  startBot().catch(err => {
    console.error('[Bot] Fatal startup error:', err.message)
    scheduleRetry(5000)
  })
})

process.on('unhandledRejection', (reason) => {
  console.warn('[Bot] Unhandled rejection (safe to ignore):', String(reason))
})
