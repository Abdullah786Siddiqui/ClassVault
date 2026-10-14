import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import db from './services/db'
import { syncPendingItems } from './services/sync'

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
)

async function notifyClientsSyncCompleted() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  clients.forEach((client) => {
    client.postMessage({ type: 'CLASSVAULT_SYNC_COMPLETED' })
  })
}

async function runBackgroundSync() {
  const storedToken = await db.settings.get('classvault.driveAccessToken')
  if (!storedToken?.value) return

  let token
  try {
    token = JSON.parse(storedToken.value)
  } catch (error) {
    console.warn('[ClassVault] Background sync token could not be read:', error)
    await db.settings.delete('classvault.driveAccessToken')
    return
  }

  if (!token.accessToken || !token.expiresAt || Date.now() >= token.expiresAt) {
    // Token is expired for background sync. Do not delete it; foreground app will silently renew it on open.
    return
  }

  const result = await syncPendingItems()
  if (!result.ok) {
    throw new Error(result.reason || 'Background upload failed.')
  }
  await notifyClientsSyncCompleted()
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'classvault-sync') {
    event.waitUntil(runBackgroundSync())
  }
})

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
