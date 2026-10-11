import { defineStore } from 'pinia'
import db from '../services/db'
import {
  sanitizeSegment,
  isDuplicateSemesterName,
  isDuplicateSubjectName,
} from '../utils/sanitize'
import { getDriveAccessToken, deleteDriveFile } from '../services/drive'

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
      const [rawSemesters, subjects] = await Promise.all([
        db.semesters.orderBy('createdAt').reverse().toArray(),
        db.subjects.orderBy('createdAt').toArray(),
      ])
      // Map semesters - no hardcoded exams/terms! Starts empty until student adds them.
      this.semesters = rawSemesters.map((sem) => ({
        ...sem,
        exams: Array.isArray(sem.exams) ? sem.exams : [],
      }))
      this.subjects = subjects
      this.loading = false
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

      // 1. Delete all synced items for this exam from Google Drive
      try {
        const auth = await getDriveAccessToken()
        if (auth.ok) {
          const itemsToDelete = await db.items
            .where({ semesterId: Number(semesterId), exam: examId })
            .toArray()
          for (const it of itemsToDelete) {
            if (it.driveFileId) {
              await deleteDriveFile(it.driveFileId, auth.accessToken)
            }
          }
        }
      } catch (err) {
        console.warn('[ClassVault] Error deleting exam files from Drive:', err)
      }

      // 2. Delete items locally
      await db.items.where({ semesterId: Number(semesterId), exam: examId }).delete()

      // 3. Remove exam from semester
      const updatedExams = (semester.exams || []).filter((e) => e.id !== examId)
      await db.semesters.update(Number(semesterId), { exams: updatedExams })
      await this.load()
    },

    async deleteSemester(id) {
      // Delete all synced items from Google Drive (Fulfills requirement: "yaha se delete ho to waha se bhi delete ho")
      try {
        const auth = await getDriveAccessToken()
        if (auth.ok) {
          const itemsToDelete = await db.items.where({ semesterId: Number(id) }).toArray()
          for (const it of itemsToDelete) {
            if (it.driveFileId) {
              await deleteDriveFile(it.driveFileId, auth.accessToken)
            }
          }
        }
      } catch (err) {
        console.warn('[ClassVault] Error deleting semester files from Google Drive:', err)
      }

      await db.transaction('rw', db.semesters, db.subjects, db.items, async () => {
        await db.semesters.delete(id)
        await db.subjects.where({ semesterId: id }).delete()
        await db.items.where({ semesterId: id }).delete()
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
      // Delete all synced items of this subject from Google Drive
      try {
        const auth = await getDriveAccessToken()
        if (auth.ok) {
          const itemsToDelete = await db.items.where({ subjectId: Number(id) }).toArray()
          for (const it of itemsToDelete) {
            if (it.driveFileId) {
              await deleteDriveFile(it.driveFileId, auth.accessToken)
            }
          }
        }
      } catch (err) {
        console.warn('[ClassVault] Error deleting subject files from Google Drive:', err)
      }

      await db.transaction('rw', db.subjects, db.items, async () => {
        await db.subjects.delete(id)
        await db.items.where({ subjectId: id }).delete()
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

      // Note: Renaming a subject updates the local record. The existing Google Drive
      // folder is not renamed to avoid breaking cached path references.
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

      // Note: Renaming a semester locally updates the UI. Existing Google Drive
      // folder path remains preserved.
      await db.semesters.update(id, { name: cleanName })
      await this.load()
    },

    getSubjectsForSemester(semesterId) {
      return this.subjects.filter((subject) => subject.semesterId === Number(semesterId))
    },
  },
})
