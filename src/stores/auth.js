import { defineStore } from 'pinia'
import {
  connectGoogleDrive,
  trySilentTokenRestore,
  hasPreviouslyConnected,
} from '../services/auth'
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
    /**
     * Initializes authentication state on app launch (Fixes B13).
     * Attempts silent restore so student does not have to reconnect on every reload.
     */
    async initAuth() {
      const syncStore = useSyncStore()
      await syncStore.refreshCounts()

      this.hasConnectedBefore = await hasPreviouslyConnected()

      if (!this.hasConnectedBefore) {
        this.signedIn = false
        this.status = 'Not connected'
        return
      }

      // Try silent restore
      const result = await trySilentTokenRestore()
      if (result.ok) {
        this.signedIn = true
        this.status = 'Google Drive ready'

        // Trigger sync if online
        if (navigator.onLine) {
          syncStore.syncNow().catch(() => undefined)
        }
      } else {
        this.signedIn = false
        this.status = 'Reconnect required'
      }
    },

    async connectGoogle() {
      this.reconnecting = true
      const result = await connectGoogleDrive({ forcePrompt: true })
      this.reconnecting = false

      if (!result.ok) {
        this.signedIn = false
        this.status = result.message || 'Connection failed'
        return result
      }

      this.signedIn = true
      this.hasConnectedBefore = true
      this.status = 'Google Drive ready'

      const syncStore = useSyncStore()
      await syncStore.refreshCounts()
      await syncStore.syncNow()

      return result
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
