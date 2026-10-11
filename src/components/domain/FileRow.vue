<script setup>
import { computed } from 'vue'
import BaseCard from '../ui/BaseCard.vue'
import SyncStatusBadge from './SyncStatusBadge.vue'
import IconButton from '../ui/IconButton.vue'
import BaseButton from '../ui/BaseButton.vue'
import { formatFileSize, formatDate } from '../../utils/format'
import { File, FileText, Image, Archive, Trash2, Download } from '../ui/icons.js'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['open', 'delete'])

const fileIcon = computed(() => {
  const mime = (props.item.mimeType || '').toLowerCase()
  const name = (props.item.fileName || '').toLowerCase()

  if (mime.includes('image') || /\.(png|jpe?g|webp|gif|svg)$/.test(name)) return Image
  if (mime.includes('pdf') || mime.includes('text') || /\.(pdf|doc|docx|txt)$/.test(name)) return FileText
  if (mime.includes('zip') || mime.includes('rar') || /\.(zip|tar|gz|7z)$/.test(name)) return Archive
  return File
})

const fileSizeDisplay = computed(() => {
  if (props.item.blob?.size) return formatFileSize(props.item.blob.size)
  if (props.item.fileSize) return formatFileSize(props.item.fileSize)
  return ''
})

const formattedDate = computed(() => formatDate(props.item.createdAt))
</script>

<template>
  <BaseCard
    as="div"
    class="file-row group flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="flex items-center gap-3 min-w-0">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
        <component :is="fileIcon" class="h-4.5 w-4.5" />
      </div>

      <div class="min-w-0 flex-1">
        <h4 class="truncate text-sm font-bold text-slate-900 dark:text-white" :title="item.fileName || item.title">
          {{ item.fileName || item.title || 'Attached file' }}
        </h4>
        <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <span v-if="fileSizeDisplay">{{ fileSizeDisplay }}</span>
          <span v-if="fileSizeDisplay">·</span>
          <span>{{ formattedDate }}</span>
        </div>

        <p v-if="item.syncStatus === 'failed' && item.errorMessage" class="mt-1 text-xs font-medium text-rose-500">
          {{ item.errorMessage }}
        </p>
      </div>
    </div>

    <div class="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1.5 border-t border-slate-100 sm:border-0 sm:pt-0 dark:border-slate-800/80">
      <SyncStatusBadge :status="item.syncStatus" />

      <BaseButton
        variant="secondary"
        size="sm"
        @click="emit('open', item)"
      >
        <Download class="h-3.5 w-3.5" />
        <span>Open</span>
      </BaseButton>

      <IconButton
        :icon="Trash2"
        aria-label="Delete file"
        variant="ghost"
        size="sm"
        class="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
        @click="emit('delete', item)"
      />
    </div>
  </BaseCard>
</template>
