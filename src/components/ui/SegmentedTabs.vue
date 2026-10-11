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
    class="flex w-full gap-1 rounded-xl bg-slate-200/70 p-1 backdrop-blur-xs dark:bg-slate-800/80 overflow-x-auto sm:gap-1.5 sm:rounded-2xl sm:p-1.5"
    style="scrollbar-width: none; -ms-overflow-style: none;"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      role="tab"
      :aria-selected="modelValue === tab.value"
      type="button"
      class="relative flex min-h-[38px] flex-1 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all duration-200 select-none focus-visible:outline-2 focus-visible:outline-indigo-500 whitespace-nowrap sm:min-h-[40px] sm:min-w-[5rem] sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm"
      :class="[
        modelValue === tab.value
          ? 'bg-white text-indigo-950 shadow-sm dark:bg-slate-700 dark:text-white'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
      ]"
      @click="$emit('update:modelValue', tab.value)"
    >
      <component :is="tab.icon" v-if="tab.icon" class="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
      <span>{{ tab.label }}</span>
      <span
        v-if="typeof tab.count === 'number'"
        class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold transition-colors sm:h-5 sm:min-w-[20px] sm:px-1.5 sm:text-xs"
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
