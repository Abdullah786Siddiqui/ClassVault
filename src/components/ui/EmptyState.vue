<script setup>
import BaseButton from './BaseButton.vue'

defineProps({
  icon: {
    type: [Object, Function],
    default: null,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  actionLabel: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['action'])
</script>

<template>
  <div class="empty-state flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/50 px-5 py-8 text-center backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/40 sm:px-6 sm:py-12">
    <div
      v-if="icon"
      class="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 sm:mb-4 sm:h-14 sm:w-14 sm:rounded-2xl"
    >
      <component :is="icon" class="h-5 w-5 sm:h-7 sm:w-7" aria-hidden="true" />
    </div>

    <h3 class="text-base font-bold text-slate-800 dark:text-slate-100">
      {{ title }}
    </h3>

    <p v-if="description" class="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
      {{ description }}
    </p>

    <div v-if="actionLabel" class="mt-5">
      <BaseButton variant="subtle" size="sm" @click="emit('action')">
        {{ actionLabel }}
      </BaseButton>
    </div>
  </div>
</template>
