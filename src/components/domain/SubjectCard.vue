<script setup>
import BaseCard from '../ui/BaseCard.vue'
import IconButton from '../ui/IconButton.vue'
import { Folder, ChevronRight, Edit3, Trash2 } from '../ui/icons.js'

defineProps({
  subject: {
    type: Object,
    required: true,
  },
  itemCount: {
    type: Number,
    default: 0,
  },
  showActions: {
    type: Boolean,
    default: true,
  },
  interactive: {
    type: Boolean,
    default: true,
  },
  actionsAlwaysVisible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['open', 'rename', 'delete'])
</script>

<template>
  <BaseCard
    :hoverable="interactive"
    as="div"
    class="subject-card group flex items-center justify-between p-3 sm:p-4"
    :class="{ 'cursor-default': !interactive }"
    @click="interactive && emit('open', subject.id)"
  >
    <div class="flex items-center gap-3 min-w-0">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors dark:bg-indigo-950/60 dark:text-indigo-400"
        :class="interactive ? 'group-hover:bg-indigo-600 group-hover:text-white dark:group-hover:bg-indigo-600 dark:group-hover:text-white' : ''"
      >
        <Folder class="h-5 w-5" />
      </div>
      <div class="min-w-0">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Subject
        </p>
        <h3
          class="truncate text-base font-bold text-slate-900 dark:text-white"
          :class="interactive ? 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400' : ''"
        >
          {{ subject.name }}
        </h3>
      </div>
    </div>

    <div class="flex items-center gap-1">
      <div
        v-if="showActions"
        class="subject-card-actions flex items-center gap-1 transition-opacity focus-within:opacity-100 sm-touch-actions"
        :class="actionsAlwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      >
        <IconButton
          :icon="Edit3"
          aria-label="Rename subject"
          variant="ghost"
          size="sm"
          class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          @click.stop="emit('rename', subject)"
        />
        <IconButton
          :icon="Trash2"
          aria-label="Delete subject"
          variant="ghost"
          size="sm"
          class="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
          @click.stop="emit('delete', subject)"
        />
      </div>

      <ChevronRight
        v-if="interactive"
        class="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:text-slate-600 dark:group-hover:text-indigo-400"
      />
    </div>
  </BaseCard>
</template>
