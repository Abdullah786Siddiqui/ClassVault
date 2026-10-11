<script setup>
import { computed } from 'vue'

const props = defineProps({
  as: {
    type: String,
    default: 'div',
  },
  hoverable: {
    type: Boolean,
    default: false,
  },
  padding: {
    type: String,
    default: 'md',
    validator: (p) => ['none', 'sm', 'md', 'lg'].includes(p),
  },
})

const emit = defineEmits(['click'])

const paddingClasses = computed(() => {
  switch (props.padding) {
    case 'none':
      return 'p-0'
    case 'sm':
      return 'p-3'
    case 'lg':
      return 'p-6'
    case 'md':
    default:
      return 'p-4 sm:p-5'
  }
})
</script>

<template>
  <component
    :is="as"
    class="rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-xs transition-all duration-200 dark:border-slate-800/90 dark:bg-slate-900 dark:text-slate-100 sm:rounded-3xl"
    :class="[
      paddingClasses,
      hoverable
        ? 'cursor-pointer hover:border-indigo-400 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 text-left w-full'
        : '',
    ]"
    @click="hoverable || as === 'button' ? emit('click', $event) : undefined"
  >
    <slot />
  </component>
</template>
