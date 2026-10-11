import db from './db'
import {
  downloadDriveFile,
  getDriveAccessToken,
  listAllDriveFiles,
} from './drive'
import { slugifyExam } from '../utils/sanitize'

const ROOT_FOLDER_NAMES = new Set(['classvault', 'class notes vault'])
const FOLDER_MIME = 'application/vnd.google-apps.folder'

function inferItemType(file) {
  const declared = file.appProperties?.type
  if (declared === 'text' || declared === 'photo' || declared === 'file') {
    return declared
  }

  const mime = String(file.mimeType || '').toLowerCase()
  if (mime.startsWith('image/')) return 'photo'
  if (mime.startsWith('text/') || /\.txt$/i.test(file.name || '')) return 'text'
  return 'file'
}

function buildPathNames(file, byId) {
  const names = [file.name]
  const seen = new Set([file.id])
  let parentId = file.parents?.[0]

  while (parentId && parentId !== 'root' && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    names.unshift(parent.name)
    parentId = parent.parents?.[0]
  }

  return names
}

function isVaultPath(names) {
  if (names.length < 5) return false
  return ROOT_FOLDER_NAMES.has(String(names[0] || '').trim().toLowerCase())
}

async function ensureSemester(name) {
  const existing = await db.semesters.filter((row) => row.name.trim().toLowerCase() === name.trim().toLowerCase()).first()
  if (existing) {
    return existing
  }

  const id = await db.semesters.add({
    name,
    exams: [],
    createdAt: new Date().toISOString(),
  })
  return db.semesters.get(id)
}

async function ensureExam(semester, examName, examIdHint) {
  const exams = Array.isArray(semester.exams) ? [...semester.exams] : []
  const match = exams.find(
    (exam) =>
      exam.id === examIdHint ||
      exam.name.trim().toLowerCase() === examName.trim().toLowerCase(),
  )
  if (match) return match

  const baseId = examIdHint || slugifyExam(examName)
  const uniqueId = exams.some((exam) => exam.id === baseId) ? `${baseId}-${Date.now()}` : baseId
  const created = { id: uniqueId, name: examName }
  exams.push(created)
  await db.semesters.update(semester.id, { exams })
  semester.exams = exams
  return created
}

async function ensureSubject(semesterId, name) {
  const existing = await db.subjects
    .where({ semesterId: Number(semesterId) })
    .filter((row) => row.name.trim().toLowerCase() === name.trim().toLowerCase())
    .first()
  if (existing) return existing

  const id = await db.subjects.add({
    semesterId: Number(semesterId),
    name,
    createdAt: new Date().toISOString(),
  })
  return db.subjects.get(id)
}

export async function restoreLibraryFromDrive() {
  const auth = await getDriveAccessToken()
  if (!auth.ok) {
    return { ok: false, reason: auth.message || 'Connect Google Drive to restore your library.' }
  }

  const files = await listAllDriveFiles(auth.accessToken)
  if (!files.length) {
    return { ok: true, imported: 0, skipped: 0, total: 0 }
  }

  const byId = new Map(files.map((file) => [file.id, file]))
  const existingByDriveId = new Set(
    (await db.items.toArray()).map((item) => item.driveFileId).filter(Boolean),
  )

  let imported = 0
  let skipped = 0

  for (const file of files) {
    if (!file?.id || file.mimeType === FOLDER_MIME) {
      skipped += 1
      continue
    }
    if (existingByDriveId.has(file.id)) {
      skipped += 1
      continue
    }

    const names = buildPathNames(file, byId)
    if (!isVaultPath(names)) {
      skipped += 1
      continue
    }

    const semesterName = names[1]
    const examName = names[2]
    const subjectName = names[3]
    const type = inferItemType(file)
    const examHint = file.appProperties?.exam || ''

    const semester = await ensureSemester(semesterName)
    const exam = await ensureExam(semester, examName, examHint)
    const subject = await ensureSubject(semester.id, subjectName)

    let text = file.description || ''
    if (type === 'text' && (file.size == null || Number(file.size) < 120000)) {
      try {
        const blob = await downloadDriveFile(file.id, auth.accessToken)
        text = await blob.text()
      } catch {
        text = file.description || ''
      }
    }

    await db.items.add({
      semesterId: Number(semester.id),
      subjectId: Number(subject.id),
      exam: exam.id,
      type,
      title: type === 'text' ? file.name.replace(/\.txt$/i, '') : file.name,
      text: type === 'text' ? text : '',
      caption: file.description || '',
      fileName: file.name,
      mimeType: file.mimeType || '',
      blob: null,
      thumbBlob: null,
      fileSize: Number(file.size) || 0,
      starred: file.appProperties?.starred === '1' ? 1 : 0,
      syncStatus: 'synced',
      driveFileId: file.id,
      errorMessage: '',
      retryAt: 0,
      retryCount: 0,
      createdAt: file.appProperties?.createdAt || file.createdTime || new Date().toISOString(),
      updatedAt: file.modifiedTime || new Date().toISOString(),
    })

    existingByDriveId.add(file.id)
    imported += 1
  }

  return { ok: true, imported, skipped, total: files.length }
}
