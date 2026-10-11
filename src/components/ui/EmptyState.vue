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
  <div class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/50 px-6 py-12 text-center backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/40">
    <div
      v-if="icon"
      class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
    >
      <component :is="icon" class="h-7 w-7" aria-hidden="true" />
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
