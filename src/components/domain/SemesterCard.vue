<script setup>
import { computed } from 'vue'
import BaseCard from '../ui/BaseCard.vue'
import IconButton from '../ui/IconButton.vue'
import { BookOpen, ChevronRight, Trash2 } from '../ui/icons.js'

const props = defineProps({
  semester: {
    type: Object,
    required: true,
  },
  subjectCount: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['open', 'delete'])

const formattedDate = computed(() => {
  if (!props.semester.createdAt) return ''
  return new Date(props.semester.createdAt).toLocaleDateString([], {
    month: 'short',
    year: 'numeric',
  })
})
</script>

<template>
  <BaseCard
    hoverable
    as="div"
    class="group relative flex flex-col justify-between overflow-hidden p-5"
    @click="emit('open', semester.id)"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-950/60 dark:text-indigo-400 dark:group-hover:bg-indigo-600 dark:group-hover:text-white">
          <BookOpen class="h-5 w-5" />
        </div>
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Semester
          </p>
          <h3 class="text-lg font-bold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
            {{ semester.name }}
          </h3>
        </div>
      </div>

      <div class="sm-touch-actions">
        <IconButton
          :icon="Trash2"
          aria-label="Delete semester"
          variant="ghost"
          size="sm"
          class="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
          @click.stop="emit('delete', semester)"
        />
      </div>
    </div>

    <div class="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-medium text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
      <span>{{ subjectCount }} {{ subjectCount === 1 ? 'subject' : 'subjects' }}</span>
      <span class="flex items-center gap-1 font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform dark:text-indigo-400">
        Open
        <ChevronRight class="h-3.5 w-3.5" />
      </span>
    </div>
  </BaseCard>
</template>
