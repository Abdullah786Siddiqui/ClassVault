<script setup>
import AppShell from './components/layout/AppShell.vue'
import { useInstallPrompt } from './composables/useInstallPrompt'

const {
  isInstallable,
  isIosDevice,
  showIosHint,
  triggerInstall,
  dismissIosHint,
} = useInstallPrompt()
</script>

<template>
  <AppShell :is-installable="isInstallable" @install="triggerInstall">
    <router-view />
  </AppShell>

  <!-- iOS one-time install hint (Share → Add to Home Screen) -->
  <Transition name="slide-up">
    <div
      v-if="showIosHint && isIosDevice"
      class="fixed bottom-0 inset-x-0 z-50 p-4 safe-bottom"
    >
      <div class="rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60">
            <!-- Share icon SVG (inline so no dep needed here) -->
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-slate-900 dark:text-white">Install ClassVault on iOS</p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Tap the <strong>Share</strong> button in Safari, then choose <strong>Add to Home Screen</strong> for offline access.
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss install hint"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            @click="dismissIosHint"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
