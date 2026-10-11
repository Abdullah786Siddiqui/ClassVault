import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Detects if the user is on iOS (no native install prompt support).
 */
function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Detects if the app is already running as a PWA (installed).
 */
function isInStandaloneMode() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function useInstallPrompt() {
  const isInstallable = ref(false)
  const isInstalled = ref(false)
  const isIosDevice = ref(false)
  const showIosHint = ref(false)
  const deferredPrompt = ref(null)

  function handleBeforeInstallPrompt(event) {
    // Prevent the mini-infobar from appearing on mobile
    event.preventDefault()
    deferredPrompt.value = event
    isInstallable.value = true
  }

  function handleAppInstalled() {
    isInstalled.value = true
    isInstallable.value = false
    deferredPrompt.value = null
    // Clear the hint for iOS
    localStorage.setItem('classvault-ios-hint-dismissed', 'true')
  }

  async function triggerInstall() {
    if (!deferredPrompt.value) return false

    deferredPrompt.value.prompt()
    const { outcome } = await deferredPrompt.value.userChoice

    if (outcome === 'accepted') {
      isInstalled.value = true
      isInstallable.value = false
    }

    deferredPrompt.value = null
    return outcome === 'accepted'
  }

  function dismissIosHint() {
    showIosHint.value = false
    localStorage.setItem('classvault-ios-hint-dismissed', 'true')
  }

  onMounted(() => {
    isInstalled.value = isInStandaloneMode()
    isIosDevice.value = isIos()

    // Show one-time iOS hint if on iOS, not already installed, and not dismissed before
    if (isIos() && !isInStandaloneMode()) {
      const dismissed = localStorage.getItem('classvault-ios-hint-dismissed')
      if (!dismissed) {
        showIosHint.value = true
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
  })

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleAppInstalled)
  })

  return {
    isInstallable,
    isInstalled,
    isIosDevice,
    showIosHint,
    triggerInstall,
    dismissIosHint,
  }
}
