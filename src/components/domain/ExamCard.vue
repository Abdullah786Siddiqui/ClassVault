<script setup>
import { computed } from 'vue'
import { Calendar, Award, ChevronRight, Trash2, BookOpen } from '../ui/icons.js'

const props = defineProps({
  exam: {
    type: String,
    required: true,
  },
  examName: {
    type: String,
    default: '',
  },
  subjectCount: {
    type: Number,
    default: 0,
  },
  canDelete: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['open', 'delete'])

const isMid = computed(() => props.exam === 'mid')
const isFinal = computed(() => props.exam === 'final')

const cardConfig = computed(() => {
  if (isMid.value) {
    return {
      title: props.examName || 'Mid Term',
      badge: 'Mid',
      description: 'First half syllabus & exam prep',
      icon: Calendar,
      gradient: 'from-indigo-600 to-indigo-800 text-white shadow-indigo-500/20',
      badgeBg: 'bg-white/20 text-white',
    }
  }

  if (isFinal.value) {
    return {
      title: props.examName || 'Final Term',
      badge: 'Final',
      description: 'Complete semester syllabus & finals',
      icon: Award,
      gradient: 'from-sky-500 to-blue-700 text-white shadow-sky-500/20',
      badgeBg: 'bg-white/20 text-white',
    }
  }

  // Dynamic theme for custom exams
  const displayName = props.examName || props.exam.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const shortBadge = displayName.slice(0, 8)
  
  // Hash name for distinct gradients
  const hash = displayName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const gradients = [
    'from-violet-600 to-purple-800 text-white shadow-violet-500/20',
    'from-emerald-600 to-teal-800 text-white shadow-emerald-500/20',
    'from-amber-600 to-orange-700 text-white shadow-amber-500/20',
    'from-fuchsia-600 to-rose-700 text-white shadow-fuchsia-500/20',
  ]
  const gradient = gradients[hash % gradients.length]

  return {
    title: displayName,
    badge: shortBadge,
    description: 'Custom academic term & examination',
    icon: BookOpen,
    gradient,
    badgeBg: 'bg-white/20 text-white',
  }
})
</script>

<template>
  <div
    class="group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br p-4 sm:p-6 text-left shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:translate-y-0 active:shadow-md cursor-pointer"
    :class="cardConfig.gradient"
    @click="emit('open', exam)"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2">
        <span
          class="rounded-xl px-2.5 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-xs"
          :class="cardConfig.badgeBg"
        >
          {{ cardConfig.badge }}
        </span>
        <!-- Optional Delete Button for exam -->
        <button
          v-if="canDelete"
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-lg bg-black/20 text-white/80 opacity-0 transition-opacity hover:bg-rose-600 hover:text-white group-hover:opacity-100 sm-touch-actions"
          title="Delete exam"
          aria-label="Delete exam"
          @click.stop="emit('delete', { id: exam, name: cardConfig.title })"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>

      <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
        <component :is="cardConfig.icon" class="h-6 w-6 text-white" />
      </div>
    </div>

    <div class="mt-6 sm:mt-8">
      <h3 class="text-xl sm:text-2xl font-black tracking-tight text-white">
        {{ cardConfig.title }}
      </h3>
      <p class="mt-1 text-xs font-medium text-white/80">
        {{ cardConfig.description }}
      </p>

      <div class="mt-4 sm:mt-6 flex items-center justify-between border-t border-white/20 pt-3 text-xs font-semibold text-white/90">
        <span>{{ subjectCount }} {{ subjectCount === 1 ? 'subject' : 'subjects' }}</span>
        <span class="flex items-center gap-1 transition-transform group-hover:translate-x-1">
          Open exam notes
          <ChevronRight class="h-4 w-4" />
        </span>
      </div>
    </div>
  </div>
</template>
