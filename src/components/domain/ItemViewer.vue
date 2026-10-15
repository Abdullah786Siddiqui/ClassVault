<script setup>
import { ref, computed, watch } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseTextarea from '../ui/BaseTextarea.vue'
import SyncStatusBadge from './SyncStatusBadge.vue'
import { useObjectUrl } from '../../composables/useObjectUrl'
import { useSyncStore } from '../../stores/sync'
import { useToast } from '../../composables/useToast'
import { formatDate, formatFileSize } from '../../utils/format'
import { X, Trash2, Edit3, Download, ExternalLink, Maximize2 } from '../ui/icons.js'

const props = defineProps({
  item: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'delete', 'update'])

const syncStore = useSyncStore()
const toast = useToast()

const isEditing = ref(false)
const editTitle = ref('')
const editText = ref('')
const editCaption = ref('')
const isDownloading = ref(false)
const downloadedBlob = ref(null)
const isFullScreen = ref(false)

watch(
  () => props.item,
  (newItem) => {
    isEditing.value = false
    downloadedBlob.value = null
    isFullScreen.value = false
    if (newItem) {
      editTitle.value = newItem.title || ''
      editText.value = newItem.text || ''
      editCaption.value = newItem.caption || ''

      // Automatically fetch full resolution from Drive if not cached locally
      if (newItem.type === 'photo' && !newItem.blob && newItem.driveFileId && navigator.onLine) {
        handleFetchFromDrive({ silent: true })
      }
    }
  },
  { immediate: true },
)

// Active blob: local full blob > on-demand downloaded blob > thumbnail
const activeBlob = computed(() => {
  return props.item?.blob || downloadedBlob.value || props.item?.thumbBlob || null
})

const objectUrl = useObjectUrl(activeBlob)
const formattedDate = computed(() => formatDate(props.item?.createdAt))

function handleSaveEdit() {
  if (!props.item) return
  emit('update', props.item.id, {
    title: editTitle.value.trim() || 'Untitled Note',
    text: editText.value.trim(),
    caption: editCaption.value.trim(),
  })
  isEditing.value = false
}

async function handleFetchFromDrive({ silent = false } = {}) {
  if (!props.item?.driveFileId) {
    if (!silent) toast.error('File has not been uploaded to Google Drive yet')
    return null
  }

  isDownloading.value = true
  try {
    const blob = await syncStore.downloadFile(props.item)
    downloadedBlob.value = blob
    if (!silent) toast.success('Loaded original full resolution photo')
    return blob
  } catch (err) {
    if (!silent) toast.error(err.message || 'Failed to download file from Drive')
    return null
  } finally {
    isDownloading.value = false
  }
}

async function handleOpenFile() {
  const blob = props.item?.blob || downloadedBlob.value || await handleFetchFromDrive()
  if (!blob) return

  const url = URL.createObjectURL(blob)
  const safeName = props.item.fileName || props.item.title || 'file'

  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="item"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 sm:p-4 backdrop-blur-xs"
      @click.self="emit('close')"
    >
      <div :class="['relative flex w-full flex-col overflow-hidden sm:rounded-3xl rounded-t-2xl border-0 sm:border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900', item.type === 'photo' ? 'sm:max-w-4xl max-h-[96dvh] sm:max-h-[95vh]' : 'sm:max-w-xl max-h-[90dvh] sm:max-h-[92vh]']">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5 sm:py-4">
          <div class="flex items-center gap-2.5 min-w-0">
            <SyncStatusBadge :status="item.syncStatus" show-label />
            <span class="text-xs text-slate-400 dark:text-slate-500">{{ formattedDate }}</span>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              v-if="item.type === 'photo' && objectUrl"
              type="button"
              aria-label="Full screen photo"
              title="Full screen photo"
              class="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="isFullScreen = true"
            >
              <Maximize2 class="h-4 w-4" />
            </button>

            <button
              v-if="item.type === 'text' && !isEditing"
              type="button"
              aria-label="Edit note"
              class="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="isEditing = true"
            >
              <Edit3 class="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="Delete item"
              class="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
              @click="emit('delete', item); emit('close')"
            >
              <Trash2 class="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="Close viewer"
              class="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="emit('close')"
            >
              <X class="h-5 w-5" />
            </button>
          </div>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto p-4 safe-bottom sm:p-5">
          <!-- Text Note View / Edit -->
          <div v-if="item.type === 'text'">
            <div v-if="!isEditing" class="space-y-4">
              <h2 class="text-xl font-bold text-slate-900 dark:text-white">
                {{ item.title || 'Untitled Note' }}
              </h2>
              <div class="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {{ item.text }}
              </div>
            </div>

            <!-- Edit Form -->
            <div v-else class="space-y-4">
              <BaseInput
                v-model="editTitle"
                label="Note Title"
                placeholder="Title"
              />
              <BaseTextarea
                v-model="editText"
                label="Note Content"
                placeholder="Content"
                :rows="8"
              />
              <div class="flex gap-2.5 pt-2">
                <BaseButton variant="secondary" size="sm" @click="isEditing = false">
                  Cancel
                </BaseButton>
                <BaseButton variant="primary" size="sm" @click="handleSaveEdit">
                  Save Changes
                </BaseButton>
              </div>
            </div>
          </div>

          <!-- Photo View -->
          <div v-else-if="item.type === 'photo'" class="space-y-4">
            <div class="relative overflow-hidden rounded-2xl bg-slate-950 flex min-h-[260px] sm:min-h-[360px] items-center justify-center group/photo">
              <img
                v-if="objectUrl"
                :src="objectUrl"
                :alt="item.caption || item.title"
                class="max-h-[72vh] w-auto max-w-full object-contain cursor-zoom-in transition-transform active:scale-98"
                style="image-rendering: auto;"
                @click="isFullScreen = true"
              />

              <!-- Loading overlay while fetching original full resolution -->
              <div
                v-if="isDownloading"
                class="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-md"
              >
                <div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent"></div>
                <span class="font-medium">Loading full resolution...</span>
              </div>

              <!-- Fullscreen hint button overlay on image -->
              <button
                v-if="objectUrl"
                type="button"
                aria-label="Open Fullscreen"
                class="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md hover:bg-slate-900 transition-colors"
                @click="isFullScreen = true"
              >
                <Maximize2 class="h-3.5 w-3.5" />
                <span>Full screen</span>
              </button>

              <div
                v-else-if="!isDownloading"
                class="flex flex-col items-center justify-center gap-3 p-10 text-center text-slate-400"
              >
                <p class="text-sm font-semibold">Photo not cached locally</p>
                <BaseButton
                  v-if="item.syncStatus === 'synced'"
                  variant="primary"
                  size="sm"
                  :loading="isDownloading"
                  @click="handleFetchFromDrive({ silent: false })"
                >
                  <Download class="h-4 w-4" />
                  <span>Fetch from Google Drive</span>
                </BaseButton>
              </div>
            </div>

            <div v-if="item.caption">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Caption</h4>
              <p class="mt-1 text-sm text-slate-800 dark:text-slate-200">{{ item.caption }}</p>
            </div>
          </div>

          <!-- File View -->
          <div v-else class="space-y-4">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-850">
              <h3 class="text-base font-bold text-slate-900 dark:text-white">
                {{ item.fileName || item.title || 'Attached File' }}
              </h3>
              <p class="mt-1 text-xs text-slate-400">
                MIME: {{ item.mimeType || 'Unknown' }}
              </p>
              <p v-if="item.blob?.size || item.fileSize" class="text-xs text-slate-400">
                Size: {{ formatFileSize(item.blob?.size || item.fileSize) }}
              </p>
            </div>

            <div class="flex gap-3">
              <BaseButton
                variant="primary"
                size="md"
                block
                :loading="isDownloading"
                @click="handleOpenFile"
              >
                <ExternalLink v-if="item.blob || downloadedBlob" class="h-4 w-4" />
                <Download v-else class="h-4 w-4" />
                <span>{{ item.blob || downloadedBlob ? 'Open file' : 'Download from Google Drive' }}</span>
              </BaseButton>
            </div>
          </div>
        </div>
    </div>

    <!-- Dedicated Full Screen Photo Modal (Actual Resolution, No Blur, Full Viewport) -->
    <div
      v-if="isFullScreen && objectUrl"
      class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 p-2 sm:p-4 backdrop-blur-md select-none"
      @click.self="isFullScreen = false"
    >
      <div class="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          type="button"
          aria-label="Open full resolution in new tab"
          title="Open original in browser"
          class="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 backdrop-blur-md transition-colors"
          @click="handleOpenFile"
        >
          <ExternalLink class="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Close fullscreen"
          title="Close fullscreen"
          class="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 backdrop-blur-md transition-colors"
          @click="isFullScreen = false"
        >
          <X class="h-6 w-6" />
        </button>
      </div>

      <div
        v-if="isDownloading"
        class="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs text-white backdrop-blur-md"
      >
        <div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent"></div>
        <span>Upgrading to original resolution...</span>
      </div>

      <img
        :src="objectUrl"
        :alt="item.caption || item.title"
        class="h-auto w-auto max-h-[94vh] max-w-[96vw] object-contain shadow-2xl"
        style="image-rendering: auto;"
      />
    </div>
        </div>

  </Teleport>
</template>
