<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useSyncStore } from '../../stores/sync'
import { useToast } from '../../composables/useToast'
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertTriangle } from '../ui/icons.js'
import BaseButton from '../ui/BaseButton.vue'

const authStore = useAuthStore()
const syncStore = useSyncStore()
const toast = useToast()

const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

function updateOnlineStatus() {
  isOnline.value = navigator.onLine
}

onMounted(() => {
  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
  syncStore.refreshCounts()
})

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineStatus)
  window.removeEventListener('offline', updateOnlineStatus)
})

const pendingCount = computed(() => syncStore.pendingCount)
const failedCount = computed(() => syncStore.failedCount)

// Main title: remaining offline status (Drive mein kitni cheezein nahi gayi hain)
const statusTitle = computed(() => {
  if (!authStore.signedIn) {
    return 'Google Drive Not Connected'
  }
  if (!isOnline.value) {
    return `${pendingCount.value} ${pendingCount.value === 1 ? 'item' : 'items'} offline`
  }
  if (syncStore.isSyncing) {
    if (syncStore.syncProgress) {
      return `Uploading ${syncStore.syncProgress.current} of ${syncStore.syncProgress.total} to Drive...`
    }
    return 'Syncing to Drive...'
  }
  if (failedCount.value > 0) {
    return `${failedCount.value} ${failedCount.value === 1 ? 'item' : 'items'} failed to upload`
  }
  if (pendingCount.value > 0) {
    return `${pendingCount.value} ${pendingCount.value === 1 ? 'item' : 'items'} offline (Drive mein nahi gaye)`
  }
  return 'All synced to Google Drive'
})

// Subtitle: clear offline description
const statusSubtitle = computed(() => {
  if (!authStore.signedIn) {
    return `${pendingCount.value} ${pendingCount.value === 1 ? 'item' : 'items'} offline on device · Connect Drive to backup`
  }
  if (!isOnline.value) {
    return 'Internet disconnected · Will sync when connection restores'
  }
  if (failedCount.value > 0) {
    return 'Could not upload some items · Tap retry to try again'
  }
  if (pendingCount.value > 0) {
    return 'Saved on this device · Waiting to upload to Google Drive'
  }
  return '0 items remaining offline · All notes & files backed up'
})

const statusIcon = computed(() => {
  if (!isOnline.value) return CloudOff
  if (!authStore.signedIn) return Cloud
  if (failedCount.value > 0) return AlertTriangle
  if (syncStore.isSyncing || pendingCount.value > 0) return RefreshCw
  return CheckCircle2
})

async function handleConnect() {
  const result = await authStore.connectGoogle()
  if (result.ok) {
    toast.success('Connected to Google Drive')
  } else {
    toast.error(result.message || 'Google Drive connection failed')
  }
}

async function handleSyncNow() {
  if (!isOnline.value) {
    toast.info('You are currently offline')
    return
  }
  if (!authStore.signedIn) {
    toast.info('Please connect Google Drive first')
    return
  }

  try {
    const result = await syncStore.syncNow()
    if (result.ok) {
      toast.success(result.uploaded ? `Synced ${result.uploaded} items to Drive` : 'All items are already in Drive')
    } else {
      toast.error(result.reason || 'Sync failed')
    }
  } catch (err) {
    toast.error(err.message || 'Error during sync')
  }
}

async function handleRetryFailed() {
  if (!isOnline.value) {
    toast.info('You are currently offline')
    return
  }
  if (!authStore.signedIn) {
    toast.info('Please connect Google Drive first')
    return
  }

  try {
    toast.info('Retrying uploads to Drive...')
    const result = await syncStore.retryFailed()
    if (result.ok) {
      toast.success(result.uploaded ? `Successfully uploaded ${result.uploaded} items` : 'Retried successfully')
    } else {
      toast.error(result.reason || 'Retry failed')
    }
  } catch (err) {
    toast.error(err.message || 'Error retrying items')
  }
}
</script>

<template>
  <div class="mb-6 overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-600 to-sky-600 p-4 sm:p-5 text-white shadow-md shadow-indigo-500/10 dark:border-indigo-900/40">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <!-- Status & Offline Items Info -->
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
          <component
            :is="statusIcon"
            class="h-5 w-5 sm:h-6 sm:w-6 text-white"
            :class="{ 'animate-spin': syncStore.isSyncing }"
          />
        </div>

        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="truncate text-sm sm:text-base font-bold tracking-tight text-white">
              {{ statusTitle }}
            </h3>
            <span
              v-if="authStore.signedIn && isOnline && pendingCount === 0"
              class="h-2 w-2 shrink-0 rounded-full bg-emerald-400"
              title="Drive connected & all synced"
            />
            <span
              v-else-if="authStore.signedIn && pendingCount > 0"
              class="h-2 w-2 shrink-0 rounded-full bg-amber-300 animate-pulse"
              title="Items waiting for Drive upload"
            />
          </div>
          <p class="truncate text-xs text-indigo-100/90">
            {{ statusSubtitle }}
          </p>
        </div>
      </div>

      <!-- Action Button: Only Connect Drive or Sync/Retry -->
      <div class="flex items-center gap-2 shrink-0">
        <!-- Connect / Reconnect button if not signed in -->
        <BaseButton
          v-if="!authStore.signedIn"
          variant="secondary"
          size="sm"
          class="!bg-white !text-indigo-900 hover:!bg-indigo-50 font-bold"
          :loading="authStore.reconnecting"
          @click="handleConnect"
        >
          <Cloud class="h-4 w-4" />
          <span>{{ authStore.hasConnectedBefore ? 'Reconnect Drive' : 'Connect Drive' }}</span>
        </BaseButton>

        <!-- Retry Failed action if items failed -->
        <BaseButton
          v-else-if="failedCount > 0"
          variant="secondary"
          size="sm"
          class="!bg-rose-500/90 !text-white !border-rose-400 hover:!bg-rose-600 font-bold"
          :loading="syncStore.isSyncing"
          @click="handleRetryFailed"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': syncStore.isSyncing }" />
          <span>Retry ({{ failedCount }})</span>
        </BaseButton>

        <!-- Sync Now button -->
        <BaseButton
          v-else
          variant="secondary"
          size="sm"
          class="!bg-white/20 !text-white !border-white/20 hover:!bg-white/30 font-bold"
          :loading="syncStore.isSyncing"
          @click="handleSyncNow"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': syncStore.isSyncing }" />
          <span>{{ pendingCount > 0 ? `Upload (${pendingCount})` : 'Sync now' }}</span>
        </BaseButton>
      </div>
    </div>
  </div>
</template>
