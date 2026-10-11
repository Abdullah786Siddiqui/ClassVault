<script setup>
import { Plus } from './icons.js'

defineProps({
  icon: {
    type: [Object, Function],
    default: () => Plus,
  },
  ariaLabel: {
    type: String,
    default: 'Add item',
  },
})

defineEmits(['click'])
</script>

<template>
  <button
    type="button"
    :aria-label="ariaLabel"
    :title="ariaLabel"
    class="fab-btn fixed right-5 z-30 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl sm:rounded-3xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 transition-all duration-200 hover:bg-indigo-700 hover:scale-105 active:scale-95 active:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
    @click="$emit('click', $event)"
  >
    <component :is="icon" class="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true" />
  </button>
</template>

<style scoped>
/* Default: above safe area inset */
.fab-btn {
  bottom: max(1.25rem, env(safe-area-inset-bottom, 1.25rem));
}

/* On mobile with bottom nav, float above the nav bar (~4.25rem) */
@media (max-width: 760px) {
  .fab-btn {
    bottom: calc(4.5rem + max(0.55rem, env(safe-area-inset-bottom, 0.55rem)));
  }
}
</style>
