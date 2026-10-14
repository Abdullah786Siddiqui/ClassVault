const SYNC_TAG = 'classvault-sync'
const PERIODIC_SYNC_TAG = 'classvault-periodic-sync'

export async function registerBackgroundSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    let scheduled = false

    // 1. One-off Background Sync (runs in background on Android / Chrome even after app is closed)
    if ('sync' in registration) {
      try {
        await registration.sync.register(SYNC_TAG)
        scheduled = true
      } catch (err) {
        console.warn('[ClassVault] Background Sync registration warning:', err)
      }
    }

    // 2. Periodic Background Sync (runs periodically in background when battery & network allow)
    if ('periodicSync' in registration) {
      try {
        const tags = await registration.periodicSync.getTags()
        if (!tags.includes(PERIODIC_SYNC_TAG)) {
          await registration.periodicSync.register(PERIODIC_SYNC_TAG, {
            minInterval: 10 * 60 * 1000, // 10 minutes
          })
        }
        scheduled = true
      } catch (err) {
        // Periodic sync requires PWA installation on some platforms
      }
    }

    return scheduled
  } catch (error) {
    console.warn('[ClassVault] Background sync registration failed:', error)
    return false
  }
}

export function listenForBackgroundSync(onSync) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return () => {}
  }

  const handler = (event) => {
    if (event.data?.type === 'CLASSVAULT_SYNC_COMPLETED') {
      onSync?.()
    }
  }

  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}
