import db from './db'
import {
  downloadDriveFile,
  getDriveAccessToken,
  listDriveFiles,
} from './drive'

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

  const baseId =
    examIdHint ||
    examName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
    'exam'
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

  const files = await listDriveFiles(auth.accessToken)

  const byId = new Map(files.map((file) => [file.id, file]))
  const localItems = await db.items.toArray()
  const existingByDriveId = new Map(
    localItems.filter((item) => item.driveFileId).map((item) => [item.driveFileId, item]),
  )
  const driveItems = files.filter((file) => {
    if (!file?.id || file.mimeType === FOLDER_MIME) return false
    return isVaultPath(buildPathNames(file, byId))
  })
  const liveDriveIds = new Set(driveItems.map((file) => file.id))

  let imported = 0
  let updated = 0
  let skipped = 0

  for (const file of files) {
    if (!file?.id || file.mimeType === FOLDER_MIME) {
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

    const existing = existingByDriveId.get(file.id)
    if (existing) {
      if (existing.syncStatus !== 'synced') {
        skipped += 1
        continue
      }

      const metadataChanged =
        (file.name && file.name !== existing.fileName) ||
        (file.mimeType && file.mimeType !== existing.mimeType) ||
        (Number(file.size) || 0) !== (Number(existing.fileSize) || 0) ||
        (file.modifiedTime && file.modifiedTime !== existing.driveModifiedTime) ||
        existing.semesterId !== Number(semester.id) ||
        existing.subjectId !== Number(subject.id) ||
        existing.exam !== exam.id

      if (metadataChanged) {
        const text = type === 'text'
          ? await (await downloadDriveFile(file.id, auth.accessToken)).text()
          : existing.text

        await db.items.update(existing.id, {
          semesterId: Number(semester.id),
          subjectId: Number(subject.id),
          exam: exam.id,
          type,
          title: type === 'text' ? file.name.replace(/\.txt$/i, '') : file.name,
          text,
          caption: file.description || '',
          fileName: file.name,
          mimeType: file.mimeType || '',
          fileSize: Number(file.size) || 0,
          starred:
            file.appProperties?.starred === '1'
              ? 1
              : file.appProperties?.starred === '0'
                ? 0
                : existing.starred,
          driveModifiedTime: file.modifiedTime || existing.driveModifiedTime || '',
          updatedAt: file.modifiedTime || existing.updatedAt,
          blob: null,
          thumbBlob: null,
        })

        if (type !== 'text') await db.filesCache.delete(file.id)
        updated += 1
      } else {
        skipped += 1
      }
      continue
    }

    const text = type === 'text'
      ? await (await downloadDriveFile(file.id, auth.accessToken)).text()
      : ''

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
      driveModifiedTime: file.modifiedTime || '',
      errorMessage: '',
      retryAt: 0,
      retryCount: 0,
      createdAt: file.appProperties?.createdAt || file.createdTime || new Date().toISOString(),
      updatedAt: file.modifiedTime || new Date().toISOString(),
    })

    existingByDriveId.set(file.id, { id: file.id, driveFileId: file.id })
    imported += 1
  }

  const removedItems = localItems.filter(
    (item) =>
      item.syncStatus === 'synced' &&
      item.driveFileId &&
      !liveDriveIds.has(item.driveFileId),
  )

  if (removedItems.length) {
    await db.transaction('rw', db.items, db.filesCache, async () => {
      for (const item of removedItems) {
        await db.items.delete(item.id)
        await db.filesCache.delete(item.driveFileId)
      }
    })
  }

  return {
    ok: true,
    imported,
    updated,
    removed: removedItems.length,
    skipped,
    total: files.length,
  }
}
