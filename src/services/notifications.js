/**
 * System notification manager for Android Notification Drawer & desktop notifications.
 * Uses a single in-place notification with fixed tag so 30 files will update
 * the same 1 single notification without cluttering the screen.
 */

const SYNC_TAG = 'classvault-sync-progress'

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission === 'denied') {
    return false
  }

  try {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  } catch (err) {
    console.warn('[ClassVault Notifications] Permission request error:', err)
    return false
  }
}

export function isNotificationSupported() {
  return typeof Notification !== 'undefined'
}

export function hasNotificationPermission() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

function buildProgressBar(current, total) {
  const safeTotal = Math.max(total, 1)
  const ratio = Math.min(1, Math.max(0, current / safeTotal))
  const filled = Math.round(ratio * 10)
  const empty = 10 - filled
  return '■'.repeat(filled) + '□'.repeat(empty)
}

async function getRegistration() {
  if (typeof self !== 'undefined' && self.registration && 'showNotification' in self.registration) {
    return self.registration
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      return await navigator.serviceWorker.ready
    } catch {
      return null
    }
  }
  return null
}

export async function showSyncProgressNotification({ current, total }) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return
  }

  const registration = await getRegistration()
  if (!registration) return

  const percentage = Math.round((current / Math.max(total, 1)) * 100)
  const bar = buildProgressBar(current, total)

  try {
    await registration.showNotification(`ClassVault · Syncing (${current}/${total})`, {
      tag: SYNC_TAG,
      body: `Uploading ${current}/${total} files (${percentage}%)\n[${bar}]`,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      renotify: false, // Does not beep or create new notifications — updates in-place!
      silent: true,
      requireInteraction: false,
      data: { url: '/' },
    })
  } catch (err) {
    console.warn('[ClassVault Notifications] Progress update error:', err)
  }
}

export async function showSyncCompleteNotification(total) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return
  }

  const registration = await getRegistration()
  if (!registration) return

  try {
    await registration.showNotification('ClassVault · Sync Complete ✓', {
      tag: SYNC_TAG,
      body: `All ${total} files are safely synced to Google Drive.`,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      renotify: false,
      silent: true,
      requireInteraction: false,
      data: { url: '/' },
    })

    // Auto-dismiss the completed notification after 6 seconds
    setTimeout(async () => {
      try {
        const notifications = await registration.getNotifications({ tag: SYNC_TAG })
        notifications.forEach((n) => n.close())
      } catch {}
    }, 6000)
  } catch (err) {
    console.warn('[ClassVault Notifications] Complete notification error:', err)
  }
}

export async function clearSyncNotification() {
  const registration = await getRegistration()
  if (!registration) return
  try {
    const notifications = await registration.getNotifications({ tag: SYNC_TAG })
    notifications.forEach((n) => n.close())
  } catch {}
}
