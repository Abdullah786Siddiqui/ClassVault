import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import db from '../services/db'
import { sanitizeFileName } from '../utils/sanitize'
import { getDriveAccessToken, deleteDriveFile, getStoredUserEmail } from '../services/drive'

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

      try {
        const userEmail = getStoredUserEmail()
        const rawItems = await db.items
          .where('[semesterId+subjectId+exam]')
          .equals([Number(semesterId), Number(subjectId), exam])
          .reverse()
          .sortBy('createdAt')

        const filtered = userEmail
          ? rawItems.filter((i) => !i.userEmail || i.userEmail === userEmail)
          : rawItems.filter((i) => !i.userEmail)

        this.items = filtered.map(wrapItemBlobs)
        return this.items
      } finally {
        this.loading = false
      }
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
      try {
        const rawItems = await db.items.orderBy('createdAt').reverse().toArray()
        this.items = rawItems.map(wrapItemBlobs)
        return this.items
      } finally {
        this.loading = false
      }
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
      const [id] = await this.addItems([payload])
      return id
    },

    async addItems(payloads) {
      if (!Array.isArray(payloads) || !payloads.length) {
        throw new Error('Select at least one item to save.')
      }

      const first = payloads[0]
      const semesterId = Number(first.semesterId)
      const subjectId = Number(first.subjectId)
      const exam = first.exam
      if (
        payloads.some(
          (payload) =>
            Number(payload.semesterId) !== semesterId ||
            Number(payload.subjectId) !== subjectId ||
            payload.exam !== exam,
        )
      ) {
        throw new Error('All items in a batch must belong to the same subject and term.')
      }

      const ids = await db.transaction('rw', db.items, async () => {
        const existingItems = await db.items
          .where('[semesterId+subjectId+exam]')
          .equals([semesterId, subjectId, exam])
          .toArray()
        const additions = []
        const now = new Date().toISOString()

        for (const payload of payloads) {
          const cleanFileName = sanitizeFileName(payload.fileName || payload.title || 'item')
          const targetTitle = (payload.title || '').trim()
          const isDuplicate = [...existingItems, ...additions].some((item) => {
            if (payload.type === 'text' && item.type === 'text') {
              return item.title.trim().toLowerCase() === targetTitle.toLowerCase()
            }
            return (item.fileName || '').trim().toLowerCase() === cleanFileName.toLowerCase()
          })

          if (isDuplicate) {
            throw new Error(`A file or note named "${cleanFileName}" already exists in this exam section.`)
          }

          const blob = payload.blob ? markRaw(payload.blob) : null
          const thumbBlob = payload.thumbBlob ? markRaw(payload.thumbBlob) : null
          const userEmail = getStoredUserEmail()
          additions.push({
            semesterId,
            subjectId,
            exam,
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
            userEmail: userEmail || '',
            errorMessage: '',
            retryAt: 0,
            retryCount: 0,
            createdAt: now,
            updatedAt: now,
          })
        }

        const addedIds = []
        for (const item of additions) {
          addedIds.push(await db.items.add(item))
        }
        return addedIds
      })

      if (
        this.currentContext.semesterId === semesterId &&
        this.currentContext.subjectId === subjectId &&
        this.currentContext.exam === exam
      ) {
        await this.loadSubjectItems(semesterId, subjectId, exam)
      } else {
        await this.load()
      }

      return ids
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

      const existing = await db.items.get(id)
      if (!existing) {
        throw new Error('This item no longer exists.')
      }
      if (existing.syncStatus === 'uploading') {
        throw new Error('Wait for the current upload to finish before editing this item.')
      }

      const updated = await db.items.update(id, {
        ...sanitizedChanges,
        syncStatus: 'pending',
        errorMessage: '',
        retryAt: 0,
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      })
      if (!updated) throw new Error('Could not update this item.')

      // Update in local state without full reload
      const index = this.items.findIndex((item) => item.id === id)
      if (index !== -1) {
        const savedItem = await db.items.get(id)
        this.items[index] = wrapItemBlobs(savedItem)
      }
    },

    async deleteItem(id) {
      const item = await db.items.get(id)
      if (item?.syncStatus === 'uploading') {
        throw new Error('Wait for the current upload to finish before deleting this item.')
      }
      if (item?.driveFileId) {
        const auth = await getDriveAccessToken()
        if (!auth.ok) {
          throw new Error(auth.message || 'Reconnect Google Drive before deleting this item.')
        }
        await deleteDriveFile(item.driveFileId, auth.accessToken)
      }

      await db.transaction('rw', db.items, db.filesCache, async () => {
        const current = await db.items.get(id)
        if (current?.syncStatus === 'uploading') {
          throw new Error('Wait for the current upload to finish before deleting this item.')
        }
        if (current?.driveFileId && !item?.driveFileId) {
          throw new Error('This item was just uploaded. Delete it again to remove the Drive copy.')
        }
        await db.items.delete(id)
        if (current?.driveFileId) await db.filesCache.delete(current.driveFileId)
      })
      this.items = this.items.filter((item) => item.id !== id)
    },
  },
})
