import { defineStore } from 'pinia'
import {
  connectGoogleDrive,
  hasPreviouslyConnected,
} from '../services/auth'
import { getStoredAccessToken } from '../services/drive'
import { useSyncStore } from './sync'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    signedIn: false,
    hasConnectedBefore: false,
    reconnecting: false,
    status: 'Checking connection...',
  }),

  getters: {
    pendingCount: () => {
      const syncStore = useSyncStore()
      return syncStore.pendingCount
    },
    failedCount: () => {
      const syncStore = useSyncStore()
      return syncStore.failedCount
    },
    lastSync: () => {
      const syncStore = useSyncStore()
      return syncStore.lastSync
    },
  },

  actions: {
    /** Restore the saved connection status without opening a Google popup. */
    async initAuth() {
      const syncStore = useSyncStore()
      await syncStore.refreshCounts()

      this.hasConnectedBefore = await hasPreviouslyConnected()

      if (getStoredAccessToken()) {
        this.signedIn = true
        this.status = navigator.onLine ? 'Google Drive ready' : 'Offline'
        if (navigator.onLine) {
          syncStore.syncNow().catch(() => undefined)
        }
        return
      }

      if (!navigator.onLine) {
        this.signedIn = false
        this.status = 'Offline'
        return
      }

      if (!this.hasConnectedBefore) {
        this.signedIn = false
        this.status = 'Not connected'
        return
      }

      // GIS token requests use a popup, even with prompt=none. Wait for a user click.
      this.signedIn = false
      this.status = 'Reconnect required'
    },

    async connectGoogle() {
      if (!navigator.onLine) {
        this.signedIn = false
        this.status = 'Offline'
        return { ok: false, message: 'Connect to the internet before connecting Google Drive.' }
      }

      this.reconnecting = true
      let result
      try {
        result = await connectGoogleDrive({ forcePrompt: true })
      } catch (error) {
        result = {
          ok: false,
          message: error?.message || 'Google Drive connection failed.',
        }
      } finally {
        this.reconnecting = false
      }

      if (!result.ok) {
        this.signedIn = false
        this.status = result.message || 'Connection failed'
        return result
      }

      this.signedIn = true
      this.hasConnectedBefore = true
      this.status = 'Google Drive ready'

      const syncStore = useSyncStore()
      const syncResult = await syncStore.syncNow()

      return syncResult.mirrorError
        ? { ...result, mirrorError: syncResult.mirrorError }
        : result
    },

    async refreshPendingCount() {
      const syncStore = useSyncStore()
      await syncStore.refreshCounts()
    },

    async syncNow() {
      const syncStore = useSyncStore()
      return syncStore.syncNow()
    },
  },
})
