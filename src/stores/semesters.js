import { defineStore } from 'pinia'
import db from '../services/db'
import {
  buildDrivePath,
  sanitizeSegment,
  isDuplicateSemesterName,
  isDuplicateSubjectName,
} from '../utils/sanitize'
import { getDriveAccessToken, deleteDriveFile, renameDriveFolderPath } from '../services/drive'

async function removeItemsLocally(items) {
  for (const item of items) {
    await db.items.delete(item.id)
    if (item.driveFileId) await db.filesCache.delete(item.driveFileId)
  }
}

function ensureItemsAreNotUploading(items) {
  if (items.some((item) => item.syncStatus === 'uploading')) {
    throw new Error('Wait for the current uploads to finish before deleting this section.')
  }
}

export const useSemesterStore = defineStore('semester', {
  state: () => ({
    semesters: [],
    subjects: [],
    loading: false,
  }),

  getters: {
    semesterById: (state) => (id) =>
      state.semesters.find((semester) => semester.id === Number(id)),
    subjectById: (state) => (id) =>
      state.subjects.find((subject) => subject.id === Number(id)),
  },

  actions: {
    async load() {
      this.loading = true
      try {
        const [rawSemesters, subjects] = await Promise.all([
          db.semesters.orderBy('createdAt').reverse().toArray(),
          db.subjects.orderBy('createdAt').toArray(),
        ])
        this.semesters = rawSemesters.map((sem) => ({
          ...sem,
          exams: Array.isArray(sem.exams) ? sem.exams : [],
        }))
        this.subjects = subjects
      } finally {
        this.loading = false
      }
    },

    async addSemester(name) {
      const cleanName = sanitizeSegment(name, '')
      if (!cleanName) {
        throw new Error('Semester name cannot be empty')
      }

      if (isDuplicateSemesterName(this.semesters, cleanName)) {
        throw new Error(`A semester named "${cleanName}" already exists`)
      }

      const id = await db.semesters.add({
        name: cleanName,
        exams: [], // Starts completely empty per user requirement
        createdAt: new Date().toISOString(),
      })

      await this.load()
      return id
    },

    async addExamToSemester(semesterId, examName) {
      const cleanName = sanitizeSegment(examName, '')
      if (!cleanName) {
        throw new Error('Exam name cannot be empty')
      }

      const semester = this.semesters.find((s) => s.id === Number(semesterId))
      if (!semester) {
        throw new Error('Semester not found')
      }

      const existingExams = semester.exams || []
      const isDuplicate = existingExams.some(
        (e) => e.name.trim().toLowerCase() === cleanName.toLowerCase(),
      )
      if (isDuplicate) {
        throw new Error(`An examination named "${cleanName}" already exists in this semester`)
      }

      const slug = cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'exam'
      const uniqueId = existingExams.some((e) => e.id === slug) ? `${slug}-${Date.now()}` : slug

      const updatedExams = [...existingExams, { id: uniqueId, name: cleanName }]
      await db.semesters.update(Number(semesterId), { exams: updatedExams })
      await this.load()
      return uniqueId
    },

    async deleteExamFromSemester(semesterId, examId) {
      const semester = this.semesters.find((s) => s.id === Number(semesterId))
      if (!semester) return
      const itemsToDelete = await db.items
        .where({ semesterId: Number(semesterId), exam: examId })
        .toArray()
      ensureItemsAreNotUploading(itemsToDelete)

      try {
        const auth = await getDriveAccessToken()
        if (!auth.ok && itemsToDelete.some((item) => item.driveFileId)) {
          throw new Error(auth.message || 'Reconnect Google Drive before deleting these items.')
        }
        if (auth.ok) {
          for (const it of itemsToDelete) {
            if (it.driveFileId) {
              await deleteDriveFile(it.driveFileId, auth.accessToken)
            }
          }
        }
      } catch (err) {
        throw err
      }

      const updatedExams = (semester.exams || []).filter((e) => e.id !== examId)
      await db.transaction('rw', db.semesters, db.items, db.filesCache, async () => {
        await removeItemsLocally(itemsToDelete)
        await db.semesters.update(Number(semesterId), { exams: updatedExams })
      })
      await this.load()
    },

    async deleteSemester(id) {
      const itemsToDelete = await db.items.where({ semesterId: Number(id) }).toArray()
      ensureItemsAreNotUploading(itemsToDelete)
      try {
        const auth = await getDriveAccessToken()
        if (!auth.ok && itemsToDelete.some((item) => item.driveFileId)) {
          throw new Error(auth.message || 'Reconnect Google Drive before deleting these items.')
        }
        if (auth.ok) {
          for (const it of itemsToDelete) {
            if (it.driveFileId) {
              await deleteDriveFile(it.driveFileId, auth.accessToken)
            }
          }
        }
      } catch (err) {
        throw err
      }

      await db.transaction('rw', db.semesters, db.subjects, db.items, db.filesCache, async () => {
        await removeItemsLocally(itemsToDelete)
        await db.semesters.delete(id)
        await db.subjects.where({ semesterId: id }).delete()
      })
      await this.load()
    },

    async addSubject(semesterId, name) {
      const cleanName = sanitizeSegment(name, '')
      if (!cleanName) {
        throw new Error('Subject name cannot be empty')
      }

      if (isDuplicateSubjectName(this.subjects, semesterId, cleanName)) {
        throw new Error(`A subject named "${cleanName}" already exists in this semester`)
      }

      const id = await db.subjects.add({
        semesterId: Number(semesterId),
        name: cleanName,
        createdAt: new Date().toISOString(),
      })

      await this.load()
      return id
    },

    async deleteSubject(id) {
      const itemsToDelete = await db.items.where({ subjectId: Number(id) }).toArray()
      ensureItemsAreNotUploading(itemsToDelete)
      // Delete all synced items of this subject from Google Drive
      try {
        const auth = await getDriveAccessToken()
        if (!auth.ok && itemsToDelete.some((item) => item.driveFileId)) {
          throw new Error(auth.message || 'Reconnect Google Drive before deleting these items.')
        }
        if (auth.ok) {
          for (const it of itemsToDelete) {
            if (it.driveFileId) {
              await deleteDriveFile(it.driveFileId, auth.accessToken)
            }
          }
        }
      } catch (err) {
        throw err
      }

      await db.transaction('rw', db.subjects, db.items, db.filesCache, async () => {
        await removeItemsLocally(itemsToDelete)
        await db.subjects.delete(id)
      })
      await this.load()
    },

    async renameSubject(id, newName) {
      const cleanName = sanitizeSegment(newName, '')
      if (!cleanName) {
        throw new Error('Subject name cannot be empty')
      }

      const target = this.subjects.find((s) => s.id === id)
      if (!target) return

      if (isDuplicateSubjectName(this.subjects, target.semesterId, cleanName, id)) {
        throw new Error(`A subject named "${cleanName}" already exists in this semester`)
      }

      const semester = this.semesters.find((entry) => entry.id === target.semesterId)
      for (const exam of semester?.exams || []) {
        await renameDriveFolderPath(
          buildDrivePath(semester.name, exam.name, target.name),
          buildDrivePath(semester.name, exam.name, cleanName),
        )
      }
      await db.subjects.update(id, { name: cleanName })
      await this.load()
    },

    async renameSemester(id, newName) {
      const cleanName = sanitizeSegment(newName, '')
      if (!cleanName) {
        throw new Error('Semester name cannot be empty')
      }

      if (isDuplicateSemesterName(this.semesters, cleanName, id)) {
        throw new Error(`A semester named "${cleanName}" already exists`)
      }

      const current = this.semesters.find((semester) => semester.id === Number(id))
      if (!current) throw new Error('Semester not found.')
      await renameDriveFolderPath(current.name, cleanName)
      await db.semesters.update(id, { name: cleanName })
      await this.load()
    },

    getSubjectsForSemester(semesterId) {
      return this.subjects.filter((subject) => subject.semesterId === Number(semesterId))
    },
  },
})
