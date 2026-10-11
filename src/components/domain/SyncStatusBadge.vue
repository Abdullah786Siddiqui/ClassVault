<script setup>
import { computed } from 'vue'
import { Clock, CheckCircle2, AlertTriangle, Loader2 } from '../ui/icons.js'

const props = defineProps({
  status: {
    type: String,
    default: 'pending',
    validator: (s) => ['pending', 'synced', 'failed', 'uploading'].includes(s),
  },
  showLabel: {
    type: Boolean,
    default: false,
  },
})

const badgeConfig = computed(() => {
  switch (props.status) {
    case 'synced':
      return {
        icon: CheckCircle2,
        label: 'Synced',
        classes: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80',
        iconClass: 'text-emerald-600 dark:text-emerald-400',
      }
    case 'failed':
      return {
        icon: AlertTriangle,
        label: 'Failed',
        classes: 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80',
        iconClass: 'text-rose-600 dark:text-rose-400',
      }
    case 'uploading':
      return {
        icon: Loader2,
        label: 'Uploading',
        classes: 'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/80',
        iconClass: 'text-indigo-600 dark:text-indigo-400 animate-spin',
      }
    case 'pending':
    default:
      return {
        icon: Clock,
        label: 'Pending',
        classes: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80',
        iconClass: 'text-amber-600 dark:text-amber-400',
      }
  }
})
</script>

<template>
  <span
    :title="badgeConfig.label"
    :aria-label="badgeConfig.label"
    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold select-none"
    :class="badgeConfig.classes"
  >
    <component :is="badgeConfig.icon" class="h-3.5 w-3.5 shrink-0" :class="badgeConfig.iconClass" />
    <span v-if="showLabel">{{ badgeConfig.label }}</span>
  </span>
</template>
