import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import db from '../services/db'
import { sanitizeFileName } from '../utils/sanitize'
import { getDriveAccessToken, deleteDriveFile } from '../services/drive'

/**
 * Helper to wrap any binary blobs with markRaw so Vue's reactivity system
 * doesn't deeply observe large binary objects, avoiding memory leaks and lag.
 */
function wrapItemBlobs(item) {
  if (!item) return item
  const clean = { ...item }
  if (clean.blob) {
    clean.blob = markRaw(clean.blob)
  }
  if (clean.thumbBlob) {
    clean.thumbBlob = markRaw(clean.thumbBlob)
  }
  return clean
}

export const useItemStore = defineStore('items', {
  state: () => ({
    // Holds the items for the currently viewed subject & exam
    items: [],
    loading: false,
    currentContext: {
      semesterId: null,
      subjectId: null,
      exam: null,
    },
  }),

  actions: {
    /**
     * Efficiently load only the items for the active subject and exam
     * using the compound index [semesterId+subjectId+exam].
     */
    async loadSubjectItems(semesterId, subjectId, exam) {
      this.loading = true
      this.currentContext = {
        semesterId: Number(semesterId),
        subjectId: Number(subjectId),
        exam,
      }

      const rawItems = await db.items
        .where('[semesterId+subjectId+exam]')
        .equals([Number(semesterId), Number(subjectId), exam])
        .reverse()
        .sortBy('createdAt')

      this.items = rawItems.map(wrapItemBlobs)
      this.loading = false
      return this.items
    },

    /**
     * Fallback load for overall items when needed (e.g. global search / sync count),
     * ensuring blobs are marked raw.
     */
    async load() {
      if (this.currentContext.semesterId && this.currentContext.subjectId && this.currentContext.exam) {
        return this.loadSubjectItems(
          this.currentContext.semesterId,
          this.currentContext.subjectId,
          this.currentContext.exam,
        )
      }

      this.loading = true
      const rawItems = await db.items.orderBy('createdAt').reverse().toArray()
      this.items = rawItems.map(wrapItemBlobs)
      this.loading = false
      return this.items
    },

    /**
     * Count items for a subject without loading blobs into memory.
     */
    async countItemsForSubject(semesterId, subjectId, exam) {
      return db.items
        .where('[semesterId+subjectId+exam]')
        .equals([Number(semesterId), Number(subjectId), exam])
        .count()
    },

    async addItem(payload) {
      const cleanFileName = sanitizeFileName(payload.fileName || payload.title || 'item')
      const targetTitle = (payload.title || '').trim()

      // Duplicate prevention: Check if item with same name exists under this section
      const existingInSection = await db.items
        .where('[semesterId+subjectId+exam]')
        .equals([Number(payload.semesterId), Number(payload.subjectId), payload.exam])
        .toArray()

      const isDuplicate = existingInSection.some((it) => {
        if (payload.type === 'text' && it.type === 'text') {
          return it.title.trim().toLowerCase() === targetTitle.toLowerCase()
        }
        return (it.fileName || '').trim().toLowerCase() === cleanFileName.toLowerCase()
      })

      if (isDuplicate) {
        throw new Error(`A file or note named "${cleanFileName}" already exists in this exam section.`)
      }

      const blob = payload.blob ? markRaw(payload.blob) : null
      const thumbBlob = payload.thumbBlob ? markRaw(payload.thumbBlob) : null

      const item = {
        semesterId: Number(payload.semesterId),
        subjectId: Number(payload.subjectId),
        exam: payload.exam,
        type: payload.type,
        title: payload.title || 'Untitled',
        text: payload.text || '',
        caption: payload.caption || '',
        fileName: cleanFileName,
        mimeType: payload.mimeType || '',
        blob,
        thumbBlob,
        fileSize: payload.fileSize || blob?.size || 0,
        starred: Number(Boolean(payload.starred)),
        syncStatus: 'pending',
        driveFileId: null,
        errorMessage: '',
        retryAt: 0,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const id = await db.items.add(item)

      // Refresh current view if we are on this subject
      if (
        this.currentContext.semesterId === item.semesterId &&
        this.currentContext.subjectId === item.subjectId &&
        this.currentContext.exam === item.exam
      ) {
        await this.loadSubjectItems(item.semesterId, item.subjectId, item.exam)
      } else {
        await this.load()
      }

      return id
    },

    async updateItem(id, changes) {
      const sanitizedChanges = { ...changes }
      if (sanitizedChanges.fileName) {
        sanitizedChanges.fileName = sanitizeFileName(sanitizedChanges.fileName)
      }
      if (sanitizedChanges.blob) {
        sanitizedChanges.blob = markRaw(sanitizedChanges.blob)
      }
      if (sanitizedChanges.thumbBlob) {
        sanitizedChanges.thumbBlob = markRaw(sanitizedChanges.thumbBlob)
      }

      await db.items.update(id, {
        ...sanitizedChanges,
        updatedAt: new Date().toISOString(),
      })

      // Update in local state without full reload
      const index = this.items.findIndex((item) => item.id === id)
      if (index !== -1) {
        this.items[index] = wrapItemBlobs({ ...this.items[index], ...sanitizedChanges })
      }
    },

    async deleteItem(id) {
      // Find item to check if it has been synced to Google Drive
      const item = await db.items.get(id)
      if (item?.driveFileId) {
        // Delete from Google Drive too!
        try {
          const auth = await getDriveAccessToken()
          if (auth.ok) {
            await deleteDriveFile(item.driveFileId, auth.accessToken)
          }
        } catch (err) {
          console.warn('[ClassVault] Error deleting item from Google Drive:', err)
        }
      }

      await db.items.delete(id)
      this.items = this.items.filter((item) => item.id !== id)
    },
  },
})
