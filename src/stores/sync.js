import { defineStore } from 'pinia'
import {
  getPendingCount,
  getFailedCount,
  syncPendingItems,
  retryFailedItems,
  fetchDriveFileOnDemand,
  recoverStuckUploadingItems,
} from '../services/sync'

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
     */
    async syncNow() {
      if (this.isSyncing) return { ok: true, inProgress: true }

      this.isSyncing = true
      this.syncProgress = null
      this.errorMessage = null

      try {
        const result = await syncPendingItems((progress) => {
          this.syncProgress = progress
        })

        if (result.ok) {
          this.lastSync = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
          await this.refreshCounts()
        } else {
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
