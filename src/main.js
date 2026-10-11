import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useSyncStore } from './stores/sync'
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

// Listen for network reconnect to trigger auto-sync (Fixes B4)
window.addEventListener('online', async () => {
  const syncStore = useSyncStore(pinia)
  await syncStore.refreshCounts()
  if (authStore.signedIn) {
    await syncStore.syncNow()
  }
})
