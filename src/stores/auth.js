import { defineStore } from 'pinia'
import db from '../services/db'
import {
  connectGoogleDrive,
  hasPreviouslyConnected,
  switchGoogleDriveAccount,
  disconnectGoogleDrive,
} from '../services/auth'
import {
  getStoredAccessToken,
  persistAccessToken,
  refreshAccessTokenSilently,
  onTokenRefreshed,
  getStoredUserAccount,
  fetchGoogleUserProfile,
} from '../services/drive'
import { useSyncStore } from './sync'
import { useSemesterStore } from './semesters'

async function assignLegacyDataToUser(userEmail) {
  if (!userEmail) return
  try {
    const unassignedSemesters = await db.semesters.filter(s => !s.userEmail).toArray()
    for (const sem of unassignedSemesters) {
      await db.semesters.update(sem.id, { userEmail })
    }
    const unassignedSubjects = await db.subjects.filter(s => !s.userEmail).toArray()
    for (const sub of unassignedSubjects) {
      await db.subjects.update(sub.id, { userEmail })
    }
    const unassignedItems = await db.items.filter(i => !i.userEmail).toArray()
    for (const item of unassignedItems) {
      await db.items.update(item.id, { userEmail })
    }
  } catch (e) {
    console.warn('[ClassVault] Migration of legacy data failed:', e)
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    signedIn: false,
    hasConnectedBefore: false,
    user: null, // { email, name, photo, id }
    reconnecting: false,
    status: 'Checking connection...',
  }),

  getters: {
    canAddData: (state) => state.hasConnectedBefore,
    currentUserEmail: (state) => state.user?.email || '',
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
      this.user = getStoredUserAccount()

      // Subscribe to token refresh events from background or visibility timers
      onTokenRefreshed(({ accessToken }) => {
        if (accessToken) {
          this.signedIn = true
          this.status = navigator.onLine ? 'Google Drive ready' : 'Offline'
          if (!this.user) {
            fetchGoogleUserProfile(accessToken).then((u) => {
              if (u) this.user = u
            })
          }
        }
      })

      // 1. Check if we already have an unexpired token in memory or localStorage
      let currentToken = getStoredAccessToken()

      if (!currentToken) {
        try {
          const stored = await db.settings.get('classvault.driveAccessToken')
          if (stored?.value) {
            const parsed = JSON.parse(stored.value)
            if (
              typeof parsed.accessToken === 'string' &&
              parsed.accessToken &&
              typeof parsed.expiresAt === 'number' &&
              Date.now() < parsed.expiresAt
            ) {
              currentToken = parsed.accessToken
              await persistAccessToken(parsed.accessToken, parsed.expiresAt)
            }
          }
        } catch (e) {
          console.warn('[ClassVault Auth] IndexedDB token check failed:', e)
        }
      }

      if (currentToken) {
        this.signedIn = true
        this.status = navigator.onLine ? 'Google Drive ready' : 'Offline'
        if (!this.user) {
          fetchGoogleUserProfile(currentToken).then((u) => {
            if (u) {
              this.user = u
              assignLegacyDataToUser(u.email)
            }
          })
        } else if (this.user?.email) {
          assignLegacyDataToUser(this.user.email)
        }
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
      this.status = 'Checking Google Drive...'
      try {
        const silentResult = await refreshAccessTokenSilently()
        if (silentResult.ok) {
          this.signedIn = true
          this.status = 'Google Drive ready'
          if (!this.user && silentResult.accessToken) {
            fetchGoogleUserProfile(silentResult.accessToken).then((u) => {
              if (u) {
                this.user = u
                assignLegacyDataToUser(u.email)
              }
            })
          }
          if (navigator.onLine) {
            syncStore.syncNow().catch(() => undefined)
          }
          return
        }
      } catch (err) {
        console.warn('[ClassVault Auth] Silent background renewal failed on startup:', err)
      }

      // 5. Silent renewal was not possible
      this.signedIn = false
      this.status = 'Offline Ready'
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
      this.user = result.user || getStoredUserAccount()
      this.status = 'Google Drive ready'

      if (this.user?.email) {
        await assignLegacyDataToUser(this.user.email)
      }

      const semesterStore = useSemesterStore()
      await semesterStore.load()

      const syncStore = useSyncStore()
      const syncResult = await syncStore.syncNow({ fullMirror: true })

      return syncResult.mirrorError
        ? { ...result, mirrorError: syncResult.mirrorError }
        : result
    },

    async switchAccount() {
      if (!navigator.onLine) {
        return { ok: false, message: 'Connect to the internet to switch Google account.' }
      }

      this.reconnecting = true
      this.status = 'Switching account...'
      let result
      try {
        result = await switchGoogleDriveAccount()
      } catch (error) {
        result = {
          ok: false,
          message: error?.message || 'Failed to switch Google account.',
        }
      } finally {
        this.reconnecting = false
      }

      if (!result.ok) {
        return result
      }

      this.signedIn = true
      this.hasConnectedBefore = true
      this.user = result.user || getStoredUserAccount()
      this.status = 'Google Drive ready'

      // Reload library for the newly connected user
      const semesterStore = useSemesterStore()
      await semesterStore.load()

      // Pull down any files belonging to this account from their Google Drive
      const syncStore = useSyncStore()
      await syncStore.syncNow({ fullMirror: true }).catch(() => undefined)

      return result
    },

    async disconnect() {
      await disconnectGoogleDrive()
      this.signedIn = false
      this.hasConnectedBefore = false
      this.user = null
      this.status = 'Not connected'

      const semesterStore = useSemesterStore()
      await semesterStore.load()

      return { ok: true }
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
