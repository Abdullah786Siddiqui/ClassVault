import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useSyncStore } from './stores/sync'
import { useItemStore } from './stores/items'
import { listenForBackgroundSync, registerBackgroundSync } from './services/backgroundSync'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')

// Request persistent storage so IndexedDB is not evicted by the browser
if ('storage' in navigator && 'persist' in navigator.storage) {
  navigator.storage.persist().catch(() => undefined)
}

// Initialize authentication and attempt silent token restore on launch (Fixes B13)
const authStore = useAuthStore(pinia)
authStore.initAuth().catch(() => undefined)
registerBackgroundSync().catch(() => undefined)

listenForBackgroundSync(async () => {
  const syncStore = useSyncStore(pinia)
  await syncStore.refreshCounts()
  const itemStore = useItemStore(pinia)
  const { semesterId, subjectId, exam } = itemStore.currentContext
  if (semesterId && subjectId && exam) {
    await itemStore.loadSubjectItems(semesterId, subjectId, exam)
  }
})

// Listen for network reconnect to trigger token refresh & auto-sync (Fixes B4)
window.addEventListener('online', async () => {
  const syncStore = useSyncStore(pinia)
  await syncStore.refreshCounts()
  await authStore.checkAndRefreshToken()
  if (authStore.signedIn) {
    await syncStore.syncNow({ fullMirror: true })
  }
})

// Refresh the local Drive mirror when returning to the app after Drive changes.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && navigator.onLine) {
    authStore.checkAndRefreshToken().then(() => {
      if (authStore.signedIn) {
        useSyncStore(pinia).syncNow({ fullMirror: true }).catch((error) => {
          console.error('[ClassVault] Failed to refresh the Drive mirror:', error)
        })
      }
    })
  }
})
