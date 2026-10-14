import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { google } from 'googleapis'
import dotenv from 'dotenv'

dotenv.config()

const ROOT_FOLDER_NAME = 'ClassVault'
const TOKEN_PATH = path.resolve('token.json')
const CREDENTIALS_PATH = path.resolve('credentials.json')

let driveClient = null
const folderIdCache = new Map()

/**
 * Initialize Google Drive API client using OAuth2 token.json or Service Account credentials.json
 */
export function getDriveClient() {
  if (driveClient) return driveClient

  // 1. Check for OAuth2 token.json
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID || token.client_id,
        process.env.GOOGLE_CLIENT_SECRET || token.client_secret,
        'http://localhost:3000/oauth2callback',
      )
      oauth2Client.setCredentials(token)
      driveClient = google.drive({ version: 'v3', auth: oauth2Client })
      console.log('✓ Google Drive authenticated via OAuth2 token.json')
      return driveClient
    } catch (e) {
      console.warn('Could not load token.json:', e.message)
    }
  }

  // 2. Check for Service Account credentials.json
  if (fs.existsSync(CREDENTIALS_PATH)) {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
      })
      driveClient = google.drive({ version: 'v3', auth })
      console.log('✓ Google Drive authenticated via Service Account credentials.json')
      return driveClient
    } catch (e) {
      console.warn('Could not load credentials.json:', e.message)
    }
  }

  return null
}

/**
 * Find or create a subfolder inside parentId
 */
async function getOrCreateFolder(drive, parentId, folderName) {
  const cacheKey = `${parentId}:${folderName}`
  if (folderIdCache.has(cacheKey)) {
    return folderIdCache.get(cacheKey)
  }

  const query = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`
  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  })

  if (response.data.files && response.data.files.length > 0) {
    const id = response.data.files[0].id
    folderIdCache.set(cacheKey, id)
    return id
  }

  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })

  const newId = createRes.data.id
  folderIdCache.set(cacheKey, newId)
  return newId
}

/**
 * Ensure full path ClassVault / Semester / Exam / Subject exists and return subject folder ID
 */
export async function ensureDrivePath(drive, semesterName, examName, subjectName) {
  let rootFolderId = 'root'
  const rootId = await getOrCreateFolder(drive, 'root', ROOT_FOLDER_NAME)
  const semId = await getOrCreateFolder(drive, rootId, semesterName)
  const examId = await getOrCreateFolder(drive, semId, examName)
  const subId = await getOrCreateFolder(drive, examId, subjectName)
  return subId
}

/**
 * Upload buffer directly to Google Drive
 */
export async function uploadBufferToDrive({
  drive,
  buffer,
  fileName,
  mimeType,
  semester,
  exam,
  subject,
  caption = '',
}) {
  const folderId = await ensureDrivePath(drive, semester, exam, subject)

  const mediaStream = new Readable()
  mediaStream.push(buffer)
  mediaStream.push(null)

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
      parents: [folderId],
      description: caption,
      appProperties: {
        type: mimeType.startsWith('image/') ? 'photo' : 'file',
        semester,
        exam,
        subject,
        caption,
        source: 'whatsapp-bot',
      },
    },
    media: {
      mimeType,
      body: mediaStream,
    },
    fields: 'id, name, webViewLink',
  })

  return response.data
}
