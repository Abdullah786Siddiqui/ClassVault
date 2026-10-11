<script setup>
import { computed } from 'vue'

const props = defineProps({
  icon: {
    type: [Object, Function],
    default: null,
  },
  ariaLabel: {
    type: String,
    required: true,
  },
  variant: {
    type: String,
    default: 'ghost',
    validator: (v) => ['ghost', 'secondary', 'primary', 'danger'].includes(v),
  },
  size: {
    type: String,
    default: 'md',
    validator: (s) => ['sm', 'md', 'lg'].includes(s),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['click'])

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500'
    case 'secondary':
      return 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
    case 'danger':
      return 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
    case 'ghost':
    default:
      return 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
  }
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'w-9 h-9 text-xs'
    case 'lg':
      return 'w-12 h-12 text-base'
    case 'md':
    default:
      return 'w-11 h-11 text-sm'
  }
})
</script>

<template>
  <button
    type="button"
    :aria-label="ariaLabel"
    :title="ariaLabel"
    :disabled="disabled"
    class="inline-flex items-center justify-center rounded-2xl transition-all duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
    :class="[variantClasses, sizeClasses]"
    @click="emit('click', $event)"
  >
    <component :is="icon" v-if="icon" class="h-5 w-5" aria-hidden="true" />
    <slot v-else />
  </button>
</template>
