<script setup>
import { useToast } from '../../composables/useToast'
import { CheckCircle2, AlertTriangle, Info, X } from './icons.js'

const { toasts, removeToast } = useToast()
</script>

<template>
  <div
    aria-live="polite"
    class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:top-6"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        role="status"
        class="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl p-3.5 shadow-lg border backdrop-blur-md transition-all duration-200"
        :class="{
          'border-emerald-200 bg-white/95 text-emerald-950 dark:border-emerald-800/80 dark:bg-slate-900/95 dark:text-emerald-200':
            toast.type === 'success',
          'border-rose-200 bg-white/95 text-rose-950 dark:border-rose-800/80 dark:bg-slate-900/95 dark:text-rose-200':
            toast.type === 'error',
          'border-slate-200 bg-white/95 text-slate-900 dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-100':
            toast.type === 'info',
        }"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <CheckCircle2
            v-if="toast.type === 'success'"
            class="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <AlertTriangle
            v-else-if="toast.type === 'error'"
            class="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400"
          />
          <Info
            v-else
            class="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400"
          />
          <p class="text-sm font-medium leading-snug">
            {{ toast.message }}
          </p>
        </div>

        <button
          type="button"
          aria-label="Dismiss toast"
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          @click="removeToast(toast.id)"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-16px) scale(0.96);
}
.toast-leave-to {
  opacity: 0;
  transform: scale(0.92);
}
</style>
