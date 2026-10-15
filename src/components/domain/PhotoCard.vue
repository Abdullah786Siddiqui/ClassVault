<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import BaseCard from '../ui/BaseCard.vue'
import SyncStatusBadge from './SyncStatusBadge.vue'
import IconButton from '../ui/IconButton.vue'
import { useObjectUrl } from '../../composables/useObjectUrl'
import { formatDate } from '../../utils/format'
import { Image as ImageIcon, Trash2, CloudDownload, RefreshCw } from '../ui/icons.js'
import { fetchDriveFileOnDemand } from '../../services/sync'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['open', 'delete'])

const localBlob = ref(null)
const isAutoLoading = ref(false)

// Use thumbnail if available, otherwise original local blob or auto-fetched blob
const activeBlob = computed(() => props.item.thumbBlob || props.item.blob || localBlob.value)
const imageUrl = useObjectUrl(activeBlob)

async function autoFetchBlob() {
  if (activeBlob.value) return
  if (!props.item.driveFileId || props.item.syncStatus !== 'synced' || !navigator.onLine) return
  
  isAutoLoading.value = true
  try {
    const blob = await fetchDriveFileOnDemand(props.item)
    if (blob) {
      localBlob.value = blob
    }
  } catch {
    // Keep placeholder on network error
  } finally {
    isAutoLoading.value = false
  }
}

onMounted(() => {
  autoFetchBlob()
})

watch(
  () => [props.item?.id, props.item?.driveFileId, props.item?.blob, props.item?.thumbBlob],
  () => {
    if (props.item?.blob || props.item?.thumbBlob) {
      localBlob.value = null
    } else {
      autoFetchBlob()
    }
  },
)

const formattedDate = computed(() => formatDate(props.item.createdAt))
</script>

<template>
  <BaseCard
    hoverable
    as="article"
    padding="none"
    class="group flex flex-col overflow-hidden"
    @click="emit('open', item)"
  >
    <div class="relative aspect-4/3 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="item.caption || item.title || 'Photo'"
        loading="lazy"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />

      <div
        v-else-if="item.syncStatus === 'synced'"
        class="flex h-full w-full flex-col items-center justify-center gap-1.5 p-4 text-center text-slate-400 dark:text-slate-500"
      >
        <component
          :is="isAutoLoading ? RefreshCw : CloudDownload"
          :class="['h-8 w-8 text-indigo-500', isAutoLoading ? 'animate-spin' : '']"
        />
        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">
          {{ isAutoLoading ? 'Loading photo...' : 'Tap to load from Drive' }}
        </span>
      </div>

      <div
        v-else
        class="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-600"
      >
        <ImageIcon class="h-10 w-10 stroke-1" />
      </div>

      <!-- Sync badge overlay -->
      <div class="absolute top-2.5 left-2.5">
        <SyncStatusBadge :status="item.syncStatus" />
      </div>

      <!-- Delete action overlay -->
      <div class="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 sm-touch-actions">
        <IconButton
          :icon="Trash2"
          aria-label="Delete photo"
          variant="secondary"
          size="sm"
          class="!bg-white/90 !text-slate-600 shadow-md hover:!text-rose-600 dark:!bg-slate-900/90 dark:!text-slate-300 dark:hover:!text-rose-400"
          @click.stop="emit('delete', item)"
        />
      </div>
    </div>

    <div class="p-3">
      <p v-if="item.caption" class="line-clamp-2 text-xs font-medium text-slate-700 dark:text-slate-200">
        {{ item.caption }}
      </p>
      <p v-else class="text-xs text-slate-400 dark:text-slate-500">
        {{ item.title || 'No caption' }}
      </p>

      <div class="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
        <span>{{ formattedDate }}</span>
      </div>

      <p v-if="item.syncStatus === 'failed' && item.errorMessage" class="mt-1 text-[11px] font-medium text-rose-500">
        {{ item.errorMessage }}
      </p>
    </div>
  </BaseCard>
</template>
