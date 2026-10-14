import { defineStore } from 'pinia'
import {
  connectGoogleDrive,
  hasPreviouslyConnected,
} from '../services/auth'
import {
  getStoredAccessToken,
  refreshAccessTokenSilently,
  onTokenRefreshed,
} from '../services/drive'
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
    /** Restore the saved connection status without opening an unnecessary Google popup. */
    async initAuth() {
      const syncStore = useSyncStore()
      await syncStore.refreshCounts()

      this.hasConnectedBefore = await hasPreviouslyConnected()

      // Subscribe to token refresh events from background or visibility timers
      onTokenRefreshed(({ accessToken }) => {
        if (accessToken) {
          this.signedIn = true
          this.status = navigator.onLine ? 'Google Drive ready' : 'Offline'
        }
      })

      // 1. Check if we already have an unexpired token in localStorage or sessionStorage
      const currentToken = getStoredAccessToken()
      if (currentToken) {
        this.signedIn = true
        this.status = navigator.onLine ? 'Google Drive ready' : 'Offline'
        if (navigator.onLine) {
          syncStore.syncNow().catch(() => undefined)
        }
        return
      }

      // 2. If offline, mark as offline
      if (!navigator.onLine) {
        this.signedIn = false
        this.status = 'Offline'
        return
      }

      // 3. If user never connected, stay not connected
      if (!this.hasConnectedBefore) {
        this.signedIn = false
        this.status = 'Not connected'
        return
      }

      // 4. User previously connected! Attempt silent background token renewal without showing popups
      this.status = 'Connecting Google Drive...'
      try {
        const silentResult = await refreshAccessTokenSilently()
        if (silentResult.ok) {
          this.signedIn = true
          this.status = 'Google Drive ready'
          if (navigator.onLine) {
            syncStore.syncNow().catch(() => undefined)
          }
          return
        }
      } catch (err) {
        console.warn('[ClassVault Auth] Silent background renewal failed on startup:', err)
      }

      // 5. Silent renewal was not possible (e.g. Google session expired or cookies blocked)
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
      this.status = 'Connecting Google Drive...'
      let result
      try {
        // forcePrompt is false so users who already authorized do NOT have to see the consent screen again
        result = await connectGoogleDrive({ forcePrompt: false })
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

    async checkAndRefreshToken() {
      if (!navigator.onLine || !this.hasConnectedBefore) return
      const token = getStoredAccessToken()
      if (!token) {
        try {
          const silent = await refreshAccessTokenSilently()
          if (silent.ok) {
            this.signedIn = true
            this.status = 'Google Drive ready'
          }
        } catch (e) {
          console.warn('[ClassVault Auth] Background token check failed:', e)
        }
      }
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
