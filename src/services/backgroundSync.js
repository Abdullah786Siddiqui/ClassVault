const SYNC_TAG = 'classvault-sync'

export async function registerBackgroundSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    if ('sync' in registration) {
      await registration.sync.register(SYNC_TAG)
      return true
    }
  } catch {
    return false
  }

  return false
}

export function listenForBackgroundSync(onSync) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return () => {}
  }

  const handler = (event) => {
    if (event.data?.type === 'CLASSVAULT_SYNC') {
      onSync?.()
    }
  }

  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}
