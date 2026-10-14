import { defineStore } from 'pinia'
import {
  getPendingCount,
  getFailedCount,
  syncPendingItems,
  retryFailedItems,
  fetchDriveFileOnDemand,
  recoverStuckUploadingItems,
} from '../services/sync'
import { restoreLibraryFromDrive } from '../services/restore'
import { useItemStore } from './items'
import { useSemesterStore } from './semesters'

export const useSyncStore = defineStore('sync', {
  state: () => ({
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    lastSync: null,
    syncProgress: null, // { current: 1, total: 5 }
    errorMessage: null,
  }),

  actions: {
    async refreshCounts() {
      await recoverStuckUploadingItems()
      const [pending, failed] = await Promise.all([
        getPendingCount(),
        getFailedCount(),
      ])
      this.pendingCount = pending
      this.failedCount = failed
    },

    /**
     * Centralized sync runner using single in-flight lock (Fixes B4).
     * fullMirror: only true when user explicitly restores or connects Drive for first time.
     */
    async syncNow({ fullMirror = false } = {}) {
      if (this.isSyncing) return { ok: true, inProgress: true }

      this.isSyncing = true
      this.syncProgress = null
      this.errorMessage = null

      try {
        const uploadResult = await syncPendingItems((progress) => {
          this.syncProgress = progress
        })

        let result = uploadResult
        if (fullMirror && uploadResult.ok && navigator.onLine) {
          try {
            const mirrorResult = await restoreLibraryFromDrive()
            if (!mirrorResult.ok) {
              result = { ...uploadResult, mirrorError: mirrorResult.reason }
              this.errorMessage = mirrorResult.reason || 'Could not refresh the Google Drive library.'
            } else {
              result = { ...uploadResult, mirror: mirrorResult }
              const itemStore = useItemStore()
              const { semesterId, subjectId, exam } = itemStore.currentContext
              await Promise.all([
                semesterId && subjectId && exam
                  ? itemStore.loadSubjectItems(semesterId, subjectId, exam)
                  : Promise.resolve(),
                useSemesterStore().load(),
              ])
            }
          } catch (error) {
            result = {
              ...uploadResult,
              mirrorError: error.message || 'Could not refresh the Google Drive library.',
            }
            this.errorMessage = result.mirrorError
          }
        }

        if (result.ok && !result.mirrorError) {
          this.lastSync = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
          await this.refreshCounts()
        } else if (!result.ok) {
          this.errorMessage = result.reason || 'Sync error'
        }
        return result
      } catch (err) {
        this.errorMessage = err.message || 'Sync failed'
        return { ok: false, reason: this.errorMessage }
      } finally {
        this.isSyncing = false
        this.syncProgress = null
        await this.refreshCounts()
      }
    },

    /**
     * Resets failed items and immediately initiates sync (Fixes B14).
     */
    async retryFailed() {
      await retryFailedItems()
      await this.refreshCounts()
      return this.syncNow()
    },

    /**
     * Download or load cached Drive file on demand (Fixes B3).
     */
    async downloadFile(item) {
      return fetchDriveFileOnDemand(item)
    },
  },
})
