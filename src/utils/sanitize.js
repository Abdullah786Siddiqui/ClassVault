/**
 * Sanitizes names for Google Drive folders and local file system safety.
 * Replaces illegal folder/file characters: / \ : * ? " < > | and control characters.
 * Trims and collapses multiple spaces, ensuring clean paths.
 */

// Characters forbidden in Google Drive folder names or standard filesystems
const ILLEGAL_CHARS_REGEX = /[/\\:*?"<>|]+/g
const MULTI_SPACE_REGEX = /\s+/g
const CONTROL_CHARS_REGEX = /[\x00-\x1f\x80-\x9f]/g

/**
 * Clean a single path segment (e.g. Semester name, Subject name).
 * Prevents slashes like "OS/DBMS" from creating accidental nested subdirectories.
 */
export function sanitizeSegment(input, fallback = 'Untitled') {
  if (!input || typeof input !== 'string') {
    return fallback
  }

  let cleaned = input
    .replace(CONTROL_CHARS_REGEX, '')
    .replace(ILLEGAL_CHARS_REGEX, '-')
    .replace(MULTI_SPACE_REGEX, ' ')
    .trim()

  // Remove leading/trailing dots or dashes
  cleaned = cleaned.replace(/^[-. ]+|[-. ]+$/g, '')

  // Enforce sensible max length
  if (cleaned.length > 60) {
    cleaned = cleaned.slice(0, 60).trim()
  }

  return cleaned || fallback
}

/**
 * Clean a file name, safely preserving its extension if present.
 */
export function sanitizeFileName(fileName, fallback = 'file') {
  if (!fileName || typeof fileName !== 'string') {
    return fallback
  }

  const lastDot = fileName.lastIndexOf('.')
  if (lastDot <= 0) {
    return sanitizeSegment(fileName, fallback)
  }

  const namePart = fileName.slice(0, lastDot)
  const extPart = fileName.slice(lastDot + 1).replace(ILLEGAL_CHARS_REGEX, '').trim()

  const safeName = sanitizeSegment(namePart, fallback)
  return extPart ? `${safeName}.${extPart}` : safeName
}

/**
 * Safely build a 3-tier Drive folder path: Semester / Exam / Subject.
 * Each segment is sanitized independently so slashes inside names cannot break the structure.
 */
export function buildDrivePath(semesterName, examName, subjectName) {
  const safeSemester = sanitizeSegment(semesterName, 'Semester')
  const safeExam = sanitizeSegment(examName, 'Exam')
  const safeSubject = sanitizeSegment(subjectName, 'Subject')

  return `${safeSemester}/${safeExam}/${safeSubject}`
}

/**
 * Check if a semester name already exists in the given list (case-insensitive).
 */
export function isDuplicateSemesterName(semesters, name, currentId = null) {
  const normalized = name.trim().toLowerCase()
  return semesters.some(
    (sem) => sem.name.trim().toLowerCase() === normalized && sem.id !== currentId,
  )
}

/**
 * Check if a subject name already exists within the same semester (case-insensitive).
 */
export function isDuplicateSubjectName(subjects, semesterId, name, currentId = null) {
  const normalized = name.trim().toLowerCase()
  return subjects.some(
    (sub) =>
      sub.semesterId === Number(semesterId) &&
      sub.name.trim().toLowerCase() === normalized &&
      sub.id !== currentId,
  )
}
