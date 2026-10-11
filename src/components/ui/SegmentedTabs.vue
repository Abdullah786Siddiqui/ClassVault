<script setup>
defineProps({
  modelValue: {
    type: [String, Number],
    required: true,
  },
  tabs: {
    type: Array,
    required: true,
    // [{ value: 'notes', label: 'Notes', count: 3 }]
  },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div
    role="tablist"
    class="flex w-full gap-1.5 rounded-2xl bg-slate-200/70 p-1.5 backdrop-blur-xs dark:bg-slate-800/80 overflow-x-auto"
    style="scrollbar-width: none; -ms-overflow-style: none;"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      role="tab"
      :aria-selected="modelValue === tab.value"
      type="button"
      class="relative flex min-h-[40px] flex-1 min-w-[5rem] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200 select-none focus-visible:outline-2 focus-visible:outline-indigo-500 whitespace-nowrap"
      :class="[
        modelValue === tab.value
          ? 'bg-white text-indigo-950 shadow-sm dark:bg-slate-700 dark:text-white'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
      ]"
      @click="$emit('update:modelValue', tab.value)"
    >
      <component :is="tab.icon" v-if="tab.icon" class="h-4 w-4 shrink-0" />
      <span>{{ tab.label }}</span>
      <span
        v-if="typeof tab.count === 'number'"
        class="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold transition-colors"
        :class="[
          modelValue === tab.value
            ? 'bg-indigo-100 text-indigo-700 dark:bg-slate-600 dark:text-indigo-200'
            : 'bg-slate-300/60 text-slate-600 dark:bg-slate-850 dark:text-slate-400',
        ]"
      >
        {{ tab.count }}
      </span>
    </button>
  </div>
</template>

<style scoped>
/* Hide scrollbar for tabs on mobile */
div[role="tablist"]::-webkit-scrollbar {
  display: none;
}
</style>

