<script setup>
import { ref, onMounted, computed } from 'vue'
import { useTheme } from '../../composables/useTheme'
import { useToast } from '../../composables/useToast'
import { useAuthStore } from '../../stores/auth'
import { useSyncStore } from '../../stores/sync'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { registerBackgroundSync } from '../../services/backgroundSync'
import { requestNotificationPermission } from '../../services/notifications'
import ToastHost from '../ui/ToastHost.vue'
import BaseButton from '../ui/BaseButton.vue'
import BottomSheet from '../ui/BottomSheet.vue'
import { BookOpen, Download } from '../ui/icons.js'
import { syncIncomingWhatsAppItems } from '../../services/whatsappSync'

defineProps({
  isInstallable: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['install'])
const toast = useToast()
const authStore = useAuthStore()
const syncStore = useSyncStore()
const { isDark, toggleTheme, initTheme } = useTheme()

const isAccountSheetOpen = ref(false)
const pendingCount = computed(() => syncStore.pendingCount)

const syncIconClass = computed(() => {
  if (syncStore.isSyncing) return 'fa-solid fa-arrows-rotate fa-spin'
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'fa-solid fa-cloud-slash'
  if (pendingCount.value > 0) return 'fa-solid fa-cloud-arrow-up'
  if (authStore.signedIn) return 'fa-solid fa-cloud-check'
  return 'fa-solid fa-cloud'
})

const syncTooltip = computed(() => {
  if (syncStore.isSyncing) return 'Syncing to Google Drive...'
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return `${pendingCount.value} item(s) saved on this device (offline)`
  }
  if (!authStore.hasConnectedBefore) {
    return 'Connect Google Drive'
  }
  if (pendingCount.value > 0) {
    return `${pendingCount.value} items waiting to sync · Tap to manage Drive`
  }
  return 'Google Drive connected · Tap to view account'
})

const syncStatusLabel = computed(() => {
  if (syncStore.isSyncing) return 'Syncing...'
  if (authStore.signedIn) return 'Drive Connected'
  if (pendingCount.value > 0) return `${pendingCount.value} On Device`
  return 'Offline Ready'
})

async function handleSyncClick() {
  if (!authStore.hasConnectedBefore) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.info('You are offline. Connect to the internet to set up Google Drive.')
      return
    }
    toast.info('Connecting to Google Drive...')
    const result = await authStore.connectGoogle()
    if (result.ok) {
      toast.success('Google Drive connected!')
    } else {
      toast.error(result.message || 'Could not connect Google Drive')
    }
    return
  }

  isAccountSheetOpen.value = true
}

async function handleManualSync() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    toast.info('You are offline. Items will automatically sync when online.')
    return
  }
  try {
    requestNotificationPermission().catch(() => undefined)
    toast.info(pendingCount.value > 0 ? `Syncing ${pendingCount.value} item(s) to Drive...` : 'Checking Google Drive...')
    const result = await syncStore.syncNow()
    if (result.ok) {
      toast.success(
        result.uploaded
          ? `Synced ${result.uploaded} item${result.uploaded > 1 ? 's' : ''} to Google Drive!`
          : 'All items are already in Google Drive.',
      )
    } else {
      toast.error(result.reason || 'Sync failed')
    }
  } catch (err) {
    toast.error(err?.message || 'Error during sync')
  }
}

async function handleSwitchAccount() {
  toast.info('Opening Google account picker...')
  const result = await authStore.switchAccount()
  if (result?.ok) {
    toast.success(`Switched account to ${authStore.user?.email || 'Google Drive'}!`)
    isAccountSheetOpen.value = false
  } else {
    toast.error(result?.message || 'Account switch cancelled or failed')
  }
}

async function handleDisconnectAccount() {
  await authStore.disconnect()
  toast.info('Google Drive disconnected.')
  isAccountSheetOpen.value = false
}

onMounted(async () => {
  initTheme()
  try {
    await syncStore.refreshCounts()
    if (syncStore.pendingCount > 0) {
      registerBackgroundSync().catch(() => undefined)
      if (typeof navigator !== 'undefined' && navigator.onLine && authStore.signedIn) {
        syncStore.syncNow().catch(() => undefined)
      }
    }
  } catch (e) {
    console.warn('[ClassVault] App mount check failed:', e)
  }

  // Background polling for incoming WhatsApp items across the app
  setInterval(() => {
    syncIncomingWhatsAppItems((item) => {
      syncStore.refreshCounts()
      toast.info(`📥 Saved WhatsApp ${item.type} into ${item.subject || 'Vault'}`)
    })
  }, 6000)
})

// SW update detection
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegistered(registration) {
    if (registration) {
      setInterval(() => registration.update(), 5 * 60 * 1000)
    }
  },
  onOfflineReady() {
    toast.success('ClassVault is ready offline')
  },
})
</script>

<template>
  <div class="app-shell">
    <ToastHost />

    <!-- SW Update Banner -->
    <div v-if="needRefresh" class="sw-update-banner">
      <span><i class="fa-solid fa-arrow-rotate-right"></i> New version available</span>
      <BaseButton variant="ghost-invert" size="xs" @click="updateServiceWorker(true)">
        Update now
      </BaseButton>
    </div>

    <!-- Top Navigation Header (Replaces old sidebar) -->
    <header class="app-navbar">
      <div class="app-navbar-inner">
        <!-- Brand / Logo -->
        <div class="navbar-brand-group">
          <router-link to="/" class="app-logo" aria-label="ClassVault home">
            <span class="app-logo-icon">
              <i class="fa-solid fa-vault"></i>
            </span>
            <span class="app-logo-copy">
              <span class="app-logo-text">ClassVault</span>
              <span class="app-logo-caption">STUDY SPACE</span>
            </span>
          </router-link>

          <!-- Desktop Navigation Tabs -->
          <nav class="desktop-nav" aria-label="Main Navigation">
            <router-link to="/" class="nav-tab" exact-active-class="is-active">
              <BookOpen class="h-4 w-4" />
              <span>Library</span>
            </router-link>
          </nav>
        </div>

        <!-- Center Status Badge -->
        <div class="navbar-center">
          <div
            class="status-pill cursor-pointer select-none"
            :title="syncTooltip"
            @click="handleSyncClick"
          >
            <span
              class="status-dot"
              :class="{
                'is-active': authStore.signedIn,
                'is-pending': pendingCount > 0 && !authStore.signedIn,
                'is-syncing': syncStore.isSyncing,
              }"
            ></span>
            <span class="status-pill-text">
              {{ syncStatusLabel }}
            </span>
          </div>
        </div>

        <!-- Right Header Actions -->
        <div class="app-header-actions">
          <!-- Small Sync Button -->
          <button
            class="icon-btn sync-btn-action"
            :class="{
              'is-syncing': syncStore.isSyncing,
              'has-pending': pendingCount > 0,
              'is-connected': authStore.signedIn,
            }"
            :aria-label="syncTooltip"
            :title="syncTooltip"
            @click="handleSyncClick"
          >
            <i :class="syncIconClass" aria-hidden="true"></i>
            <span v-if="pendingCount > 0" class="sync-badge-pill">
              {{ pendingCount }}
            </span>
          </button>

          <button
            v-if="isInstallable"
            class="install-button"
            aria-label="Install ClassVault app"
            @click="emit('install')"
          >
            <Download class="h-4 w-4" />
            <span>Install App</span>
          </button>

          <button
            class="icon-btn"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleTheme()"
          >
            <i :class="isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon'" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Workspace -->
    <main class="app-main">
      <slot />
    </main>

    <!-- Mobile Bottom Navigation -->
    <nav class="mobile-nav" aria-label="Quick navigation">
      <router-link to="/" class="mobile-nav-link" exact-active-class="is-active">
        <i class="fa-solid fa-book-open" aria-hidden="true"></i>
        <span>Library</span>
      </router-link>
      <button class="mobile-nav-link" :title="syncTooltip" @click="handleSyncClick">
        <div class="relative inline-flex items-center justify-center">
          <i :class="syncIconClass" aria-hidden="true"></i>
          <span v-if="pendingCount > 0" class="mobile-sync-badge">
            {{ pendingCount }}
          </span>
        </div>
        <span>Sync</span>
      </button>
      <button class="mobile-nav-link" @click="toggleTheme()">
        <i :class="isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon'" aria-hidden="true"></i>
        <span>{{ isDark ? 'Light' : 'Dark' }}</span>
      </button>
      <button v-if="isInstallable" class="mobile-nav-link" @click="emit('install')">
        <i class="fa-solid fa-download" aria-hidden="true"></i>
        <span>Install</span>
      </button>
    </nav>

    <!-- Google Drive Account Management Modal -->
    <BottomSheet
      :open="isAccountSheetOpen"
      title="Google Drive Storage"
      @close="isAccountSheetOpen = false"
    >
      <div class="space-y-4 py-1">
        <!-- Account Card -->
        <div class="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-purple-50/50 dark:from-slate-800/80 dark:to-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/40 space-y-3">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl shrink-0 overflow-hidden font-bold">
              <img
                v-if="authStore.user?.photo"
                :src="authStore.user.photo"
                alt="Google Avatar"
                class="w-full h-full object-cover"
                referrerpolicy="no-referrer"
              />
              <i v-else class="fa-brands fa-google"></i>
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                {{ authStore.user?.name || 'ClassVault User' }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400 truncate">
                {{ authStore.user?.email || 'Connected Google Drive' }}
              </p>
            </div>
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0"
              :class="authStore.signedIn
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="authStore.signedIn ? 'bg-emerald-500' : 'bg-amber-500'"></span>
              <span>{{ authStore.signedIn ? 'Connected' : 'Offline Ready' }}</span>
            </span>
          </div>

          <!-- Vault Storage Info -->
          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/30 text-xs">
            <div class="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800">
              <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Waiting to Sync</p>
              <p class="font-extrabold text-sm text-slate-700 dark:text-slate-200 mt-0.5">
                {{ pendingCount }} {{ pendingCount === 1 ? 'item' : 'items' }}
              </p>
            </div>
            <div class="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800">
              <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Vault Status</p>
              <p class="font-extrabold text-sm text-slate-700 dark:text-slate-200 mt-0.5 truncate">
                {{ pendingCount > 0 ? 'Uploads queued' : 'All synced' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Sync Now Action -->
        <BaseButton
          variant="primary"
          class="w-full bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 py-2.5 rounded-xl font-bold cursor-pointer"
          :disabled="syncStore.isSyncing"
          @click="handleManualSync"
        >
          <i class="fa-solid" :class="syncStore.isSyncing ? 'fa-arrows-rotate fa-spin' : 'fa-cloud-arrow-up'"></i>
          <span class="ml-2">{{ syncStore.isSyncing ? 'Syncing...' : 'Sync Now with Drive' }}</span>
        </BaseButton>

        <!-- Switch Account Button -->
        <button
          type="button"
          class="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-bold transition-all cursor-pointer"
          :disabled="authStore.reconnecting"
          @click="handleSwitchAccount"
        >
          <i class="fa-solid fa-arrows-split-up-and-left text-indigo-500"></i>
          <span>{{ authStore.reconnecting ? 'Opening Google...' : 'Switch Google Account' }}</span>
        </button>

        <!-- Disconnect Button -->
        <button
          type="button"
          class="w-full text-center py-2 text-xs font-medium text-rose-500 hover:text-rose-600 hover:underline cursor-pointer"
          @click="handleDisconnectAccount"
        >
          Disconnect Google Drive
        </button>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow-x: clip;
  background: var(--color-surface-raised);
  color: var(--color-text);
  transition: background 0.2s ease, color 0.2s ease;
}

.sw-update-banner {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.625rem 1rem;
  background: linear-gradient(90deg, #7c3aed, #6d28d9);
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
}
.sw-update-banner span {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.app-navbar {
  position: sticky;
  top: 0;
  z-index: 30;
  background: color-mix(in srgb, var(--color-surface-card) 85%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--color-border);
  transition: background 0.2s ease, border-color 0.2s ease;
}

.app-navbar-inner {
  max-width: 82rem;
  margin: 0 auto;
  width: 100%;
  min-height: 4.5rem;
  padding: 0.75rem clamp(1rem, 3.5vw, 2.5rem);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
}

.navbar-brand-group {
  display: flex;
  align-items: center;
  gap: 1.75rem;
}

.app-logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  color: var(--color-text);
  transition: opacity 0.15s ease;
}
.app-logo:hover {
  opacity: 0.88;
}

.app-logo-icon {
  width: 2.65rem;
  height: 2.65rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.9rem;
  background: linear-gradient(145deg, #7c5cff, #5540d9);
  color: #fff;
  font-size: 1.05rem;
  flex-shrink: 0;
  box-shadow: 0 0.4rem 1.2rem rgba(91, 70, 222, 0.24);
}

.app-logo-copy {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.app-logo-text {
  color: var(--color-text);
  font-size: 1.15rem;
  font-weight: 850;
  letter-spacing: -0.04em;
  line-height: 1.2;
}

.app-logo-caption {
  color: var(--color-brand-700);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

html.dark .app-logo-caption {
  color: #a799ff;
}

.desktop-nav {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.nav-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.9rem;
  border-radius: 0.75rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: all 0.15s ease;
}
.nav-tab:hover {
  color: var(--color-text);
  background: var(--color-brand-50);
}
.nav-tab.is-active {
  color: var(--color-brand-700);
  background: var(--color-brand-100);
}
html.dark .nav-tab:hover {
  background: rgba(139, 92, 246, 0.1);
  color: #fff;
}
html.dark .nav-tab.is-active {
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.18);
}

.navbar-center {
  display: flex;
  align-items: center;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  transition: all 0.15s ease;
}
.status-pill.cursor-pointer:hover {
  border-color: var(--color-brand-400);
  background: var(--color-surface-card);
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #94a3b8;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.2);
  transition: all 0.2s ease;
}
.status-dot.is-active {
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}
.status-dot.is-pending {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25);
}
.status-dot.is-syncing {
  background: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
  animation: pulse 1.5s infinite;
}

.sync-btn-action {
  position: relative;
}
.sync-btn-action.is-syncing i {
  color: #6366f1;
}
.sync-btn-action.has-pending i {
  color: #f59e0b;
}
.sync-btn-action.is-connected i {
  color: #10b981;
}

.sync-badge-pill {
  position: absolute;
  top: -0.3rem;
  right: -0.3rem;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.25rem;
  font-size: 0.65rem;
  font-weight: 800;
  border-radius: 9999px;
  background: #f59e0b;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(245, 158, 11, 0.35);
}

.mobile-sync-badge {
  position: absolute;
  top: -0.4rem;
  right: -0.65rem;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.2rem;
  font-size: 0.6rem;
  font-weight: 800;
  border-radius: 9999px;
  background: #f59e0b;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-pill-text {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.app-header-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.icon-btn {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.8rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface-card);
  color: var(--color-text-muted);
  font-size: 0.95rem;
  transition: all 0.15s ease;
  cursor: pointer;
}
.icon-btn:hover {
  border-color: var(--color-brand-400);
  color: var(--color-brand-700);
  background: var(--color-brand-50);
}
.whatsapp-btn-action:hover {
  border-color: #10b981 !important;
  color: #10b981 !important;
  background: rgba(16, 185, 129, 0.12) !important;
}
html.dark .icon-btn:hover {
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.13);
}

.install-button {
  min-height: 2.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0 0.95rem;
  border: 0;
  border-radius: 0.8rem;
  background: #624de3;
  color: #fff;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 750;
  transition: background 0.16s ease, transform 0.16s ease;
  cursor: pointer;
}
.install-button:hover {
  background: #503bcf;
  transform: translateY(-1px);
}

.app-main {
  flex: 1;
  max-width: 82rem;
  width: 100%;
  min-width: 0;
  margin: 0 auto;
  padding: 2rem clamp(1rem, 3.5vw, 2.5rem) 5rem;
}

.mobile-nav {
  display: none;
}

@media (max-width: 760px) {
  .desktop-nav {
    display: none;
  }
  .navbar-center {
    display: none;
  }

  .app-navbar-inner {
    min-height: 3.75rem;
    padding: 0.4rem 0.875rem;
  }

  .app-logo-icon {
    width: 2.15rem;
    height: 2.15rem;
    border-radius: 0.75rem;
    font-size: 0.9rem;
  }

  .app-logo-text {
    font-size: 1rem;
  }

  .app-main {
    padding: 0.875rem 0.875rem calc(4rem + env(safe-area-inset-bottom, 0px));
  }

  .mobile-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 40;
    display: flex;
    justify-content: space-around;
    padding: 0.3rem 0.75rem max(0.45rem, env(safe-area-inset-bottom, 0.45rem));
    background: color-mix(in srgb, var(--color-surface-card) 92%, transparent);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid var(--color-border);
  }

  .mobile-nav-link {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.25rem 0.75rem;
    border-radius: 0.65rem;
    color: var(--color-text-muted);
    font-size: 0.68rem;
    font-weight: 700;
    text-decoration: none;
    border: none;
    background: transparent;
    cursor: pointer;
    min-height: 2.5rem;
    min-width: 3.5rem;
    justify-content: center;
  }

  .mobile-nav-link:focus-visible {
    outline-offset: -2px;
  }

  .mobile-nav-link > i {
    font-size: 1rem;
  }

  .mobile-nav-link.is-active {
    color: var(--color-brand-700);
  }

  html.dark .mobile-nav-link.is-active {
    color: #c4b5fd;
  }
}
</style>
