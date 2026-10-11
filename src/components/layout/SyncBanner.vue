<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useSyncStore } from '../../stores/sync'
import { useToast } from '../../composables/useToast'
import { getDriveAccessToken, getDriveAbout, listDriveFiles, deleteDriveFile } from '../../services/drive'
import { formatFileSize, formatDate } from '../../utils/format'
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, ExternalLink, Trash2, Folder, HardDrive } from '../ui/icons.js'
import BaseButton from '../ui/BaseButton.vue'
import BottomSheet from '../ui/BottomSheet.vue'

const authStore = useAuthStore()
const syncStore = useSyncStore()
const toast = useToast()

const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
const isDriveModalOpen = ref(false)
const driveAbout = ref(null)
const driveFiles = ref([])
const isLoadingDriveData = ref(false)

function updateOnlineStatus() {
  isOnline.value = navigator.onLine
}

async function loadGoogleDriveDetails() {
  if (!authStore.signedIn || !isOnline.value) return
  isLoadingDriveData.value = true
  try {
    const auth = await getDriveAccessToken()
    if (auth.ok) {
      const [about, files] = await Promise.all([
        getDriveAbout(auth.accessToken),
        listDriveFiles(auth.accessToken),
      ])
      driveAbout.value = about
      driveFiles.value = files
    }
  } catch (err) {
    console.warn('[ClassVault] Failed to load Drive details:', err)
  } finally {
    isLoadingDriveData.value = false
  }
}

onMounted(() => {
  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
  syncStore.refreshCounts()
  if (authStore.signedIn) {
    loadGoogleDriveDetails()
  }
})

watch(
  () => authStore.signedIn,
  (signedIn) => {
    if (signedIn) {
      loadGoogleDriveDetails()
    } else {
      driveAbout.value = null
      driveFiles.value = []
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineStatus)
  window.removeEventListener('offline', updateOnlineStatus)
})

// Short status text
const statusLabel = computed(() => {
  if (!isOnline.value) return 'Offline'
  if (!authStore.signedIn) return 'Not connected'
  if (syncStore.isSyncing) {
    if (syncStore.syncProgress) {
      return `Syncing ${syncStore.syncProgress.current} of ${syncStore.syncProgress.total}`
    }
    return 'Syncing...'
  }
  if (syncStore.failedCount > 0) return 'Failed items (tap to retry)'
  if (syncStore.pendingCount > 0) return `${syncStore.pendingCount} pending`
  return 'All synced'
})

const statusIcon = computed(() => {
  if (!isOnline.value) return CloudOff
  if (!authStore.signedIn) return AlertCircle
  if (syncStore.failedCount > 0) return AlertTriangle
  if (syncStore.isSyncing) return RefreshCw
  if (syncStore.pendingCount > 0) return RefreshCw
  return CheckCircle2
})

const formattedStorage = computed(() => {
  if (!driveAbout.value?.storageQuota) return ''
  const quota = driveAbout.value.storageQuota
  const used = formatFileSize(Number(quota.usage || 0))
  const limit = quota.limit ? formatFileSize(Number(quota.limit)) : '15 GB'
  return `${used} of ${limit} used`
})

async function handleConnect() {
  const result = await authStore.connectGoogle()
  if (result.ok) {
    toast.success('Connected to Google Drive')
    await loadGoogleDriveDetails()
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
      toast.success(result.uploaded ? `Synced ${result.uploaded} items` : 'All items synced')
      await loadGoogleDriveDetails()
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
    toast.info('Retrying failed uploads...')
    const result = await syncStore.retryFailed()
    if (result.ok) {
      toast.success(result.uploaded ? `Successfully uploaded ${result.uploaded} items` : 'Retried successfully')
      await loadGoogleDriveDetails()
    } else {
      toast.error(result.reason || 'Retry failed')
    }
  } catch (err) {
    toast.error(err.message || 'Error retrying items')
  }
}

async function handleDeleteDriveFileItem(file) {
  try {
    const auth = await getDriveAccessToken()
    if (auth.ok) {
      await deleteDriveFile(file.id, auth.accessToken)
      driveFiles.value = driveFiles.value.filter((f) => f.id !== file.id)
      toast.success(`Deleted "${file.name}" from Google Drive`)
    }
  } catch (err) {
    toast.error('Failed to delete file from Google Drive')
  }
}

function openDriveModal() {
  isDriveModalOpen.value = true
  loadGoogleDriveDetails()
}
</script>

<template>
  <div class="mb-6 overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-600 to-sky-600 p-4 sm:p-5 text-white shadow-md shadow-indigo-500/10 dark:border-indigo-900/40">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        class="flex items-center gap-3"
        :class="{ 'cursor-pointer': syncStore.failedCount > 0 }"
        @click="syncStore.failedCount > 0 ? handleRetryFailed() : undefined"
      >
        <div class="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
          <component
            :is="statusIcon"
            class="h-5 w-5 sm:h-6 sm:w-6 text-white"
            :class="{ 'animate-spin': syncStore.isSyncing }"
          />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-sm sm:text-base font-bold tracking-tight text-white">
              {{ statusLabel }}
            </h3>
            <span
              v-if="authStore.signedIn && isOnline"
              class="h-2 w-2 rounded-full bg-emerald-400"
              title="Drive connected"
            />
          </div>
          <p class="text-xs text-indigo-100/90">
            <span v-if="driveAbout?.user?.emailAddress">
              {{ driveAbout.user.emailAddress }} · {{ formattedStorage || 'Drive Connected' }}
            </span>
            <span v-else>
              Last sync: {{ syncStore.lastSync || 'Never' }}
            </span>
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <!-- View Google Drive Files Data Button (Fulfills: "isko pora google drive ka adata show ho yaha pr") -->
        <BaseButton
          v-if="authStore.signedIn"
          variant="secondary"
          size="sm"
          class="!bg-white/20 !text-white !border-white/20 hover:!bg-white/30"
          @click="openDriveModal"
        >
          <HardDrive class="h-3.5 w-3.5" />
          <span>Drive Data ({{ driveFiles.length }})</span>
        </BaseButton>

        <!-- Connect / Reconnect button -->
        <BaseButton
          v-if="!authStore.signedIn"
          variant="secondary"
          size="sm"
          class="!bg-white !text-indigo-900 hover:!bg-indigo-50"
          :loading="authStore.reconnecting"
          @click="handleConnect"
        >
          <Cloud class="h-4 w-4" />
          <span>{{ authStore.hasConnectedBefore ? 'Reconnect' : 'Connect Drive' }}</span>
        </BaseButton>

        <!-- Retry Failed action if items failed -->
        <BaseButton
          v-else-if="syncStore.failedCount > 0"
          variant="secondary"
          size="sm"
          class="!bg-rose-500/90 !text-white !border-rose-400 hover:!bg-rose-600"
          :loading="syncStore.isSyncing"
          @click="handleRetryFailed"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': syncStore.isSyncing }" />
          <span>Retry ({{ syncStore.failedCount }})</span>
        </BaseButton>

        <!-- Sync now button -->
        <BaseButton
          v-else
          variant="secondary"
          size="sm"
          class="!bg-white/20 !text-white !border-white/20 hover:!bg-white/30"
          :loading="syncStore.isSyncing"
          @click="handleSyncNow"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': syncStore.isSyncing }" />
          <span>Sync now</span>
        </BaseButton>
      </div>
    </div>

    <!-- Google Drive Data Explorer BottomSheet (Fulfills requirement: "isko pora google drive ka adata show ho yaha pr") -->
    <BottomSheet
      :open="isDriveModalOpen"
      title="Google Drive Storage & Files"
      @close="isDriveModalOpen = false"
    >
      <div class="space-y-4">
        <!-- Account & Quota Header Card -->
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Connected Google Account
              </p>
              <h4 class="text-sm font-extrabold text-slate-900 dark:text-white">
                {{ driveAbout?.user?.displayName || 'Google Account' }}
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-300">
                {{ driveAbout?.user?.emailAddress || 'Connected' }}
              </p>
            </div>
            <div class="rounded-xl bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              <Cloud class="h-6 w-6" />
            </div>
          </div>

          <div v-if="driveAbout?.storageQuota" class="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span>Drive Storage</span>
              <span>{{ formattedStorage }}</span>
            </div>
          </div>
        </div>

        <!-- Files List in Drive -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Files in Google Drive ({{ driveFiles.length }})
            </h4>
            <button
              class="text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
              @click="loadGoogleDriveDetails"
            >
              Refresh List
            </button>
          </div>

          <div v-if="isLoadingDriveData" class="py-8 text-center text-xs text-slate-400">
            <i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading Google Drive data...
          </div>

          <div
            v-else-if="driveFiles.length"
            class="max-h-72 space-y-2 overflow-y-auto pr-1"
          >
            <div
              v-for="file in driveFiles"
              :key="file.id"
              class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-bold text-slate-900 dark:text-white">
                  {{ file.name }}
                </p>
                <p class="text-[11px] text-slate-400">
                  {{ file.size ? formatFileSize(Number(file.size)) : 'Folder' }}
                  <span v-if="file.modifiedTime">· {{ formatDate(file.modifiedTime) }}</span>
                </p>
              </div>

              <div class="flex items-center gap-1">
                <!-- Open in Google Drive -->
                <a
                  v-if="file.webViewLink"
                  :href="file.webViewLink"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-slate-800"
                  title="Open in Google Drive"
                >
                  <ExternalLink class="h-3.5 w-3.5" />
                </a>

                <!-- Delete from Drive -->
                <button
                  type="button"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                  title="Delete from Google Drive"
                  @click="handleDeleteDriveFileItem(file)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div
            v-else
            class="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800"
          >
            No files found in Google Drive yet. Add notes or files and tap "Sync now".
          </div>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>
