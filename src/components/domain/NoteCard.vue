<script setup>
import { computed } from 'vue'
import BaseCard from '../ui/BaseCard.vue'
import SyncStatusBadge from './SyncStatusBadge.vue'
import IconButton from '../ui/IconButton.vue'
import { formatDate } from '../../utils/format'
import { FileText, Trash2, Edit3 } from '../ui/icons.js'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['open', 'edit', 'delete'])

const formattedCreatedAt = computed(() => formatDate(props.item.createdAt))
</script>

<template>
  <BaseCard
    hoverable
    as="article"
    class="note-card group flex flex-col justify-between p-3.5 sm:p-5"
    @click="emit('open', item)"
  >
    <div>
      <div class="mb-2 flex items-start justify-between gap-2 sm:mb-3 sm:gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <FileText class="h-4.5 w-4.5" />
          </div>
          <div class="min-w-0">
            <h3 class="truncate text-base font-bold text-slate-900 dark:text-white">
              {{ item.title || 'Untitled Note' }}
            </h3>
            <p class="text-xs text-slate-400 dark:text-slate-500">
              {{ formattedCreatedAt }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <SyncStatusBadge :status="item.syncStatus" />
        <div class="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 sm-touch-actions">
            <IconButton
              :icon="Edit3"
              aria-label="Edit note"
              variant="ghost"
              size="sm"
              class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              @click.stop="emit('edit', item)"
            />
            <IconButton
              :icon="Trash2"
              aria-label="Delete note"
              variant="ghost"
              size="sm"
              class="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
              @click.stop="emit('delete', item)"
            />
          </div>
        </div>
      </div>

      <p class="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:line-clamp-4 sm:text-sm">
        {{ item.text }}
      </p>

      <p v-if="item.syncStatus === 'failed' && item.errorMessage" class="mt-2 text-xs font-medium text-rose-500">
        {{ item.errorMessage }}
      </p>
    </div>

    <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs font-semibold text-indigo-600 dark:border-slate-800/80 dark:text-indigo-400">
      <span>Read full note</span>
      <span>→</span>
    </div>
  </BaseCard>
</template>
