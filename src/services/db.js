import Dexie from 'dexie'

const db = new Dexie('classvault-db')

// Version 1: Initial schema (preserved so existing data is not wiped)
db.version(1).stores({
  semesters: '++id, name, createdAt',
  subjects: '++id, semesterId, name, createdAt',
  items:
    '++id, semesterId, subjectId, exam, type, title, text, caption, fileName, mimeType, blob, starred, syncStatus, driveFileId, errorMessage, retryAt, retryCount, createdAt, updatedAt',
  driveFolders: 'path, driveFolderId',
  settings: 'key, value',
})

// Version 2: Optimized schema removing unindexed/blob fields from index definitions
// Adds compound index [semesterId+subjectId+exam] for efficient single-query loading
// Adds filesCache table for caching downloaded media locally
db.version(2).stores({
  semesters: '++id, name, createdAt',
  subjects: '++id, semesterId, name, createdAt',
  items:
    '++id, semesterId, subjectId, exam, type, syncStatus, createdAt, [semesterId+subjectId+exam]',
  driveFolders: 'path, driveFolderId',
  settings: 'key, value',
  filesCache: 'driveFileId, cachedAt',
})

export default db
