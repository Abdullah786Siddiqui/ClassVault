<script setup>
import { onMounted, onUnmounted } from 'vue'
import BaseButton from './BaseButton.vue'
import { AlertTriangle } from './icons.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: 'Are you sure?',
  },
  message: {
    type: String,
    default: '',
  },
  confirmText: {
    type: String,
    default: 'Delete',
  },
  cancelText: {
    type: String,
    default: 'Cancel',
  },
  confirmVariant: {
    type: String,
    default: 'danger',
    validator: (v) => ['danger', 'primary'].includes(v),
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['confirm', 'cancel'])

function handleKeyDown(e) {
  if (e.key === 'Escape' && props.open) {
    emit('cancel')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs"
        aria-hidden="true"
        @click="emit('cancel')"
      />
    </Transition>

    <Transition name="zoom">
      <div
        v-if="open"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="title"
        class="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl sm:p-6"
      >
        <div class="flex items-start gap-4">
          <div
            v-if="confirmVariant === 'danger'"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
          >
            <AlertTriangle class="h-6 w-6" />
          </div>
          <div class="flex-1">
            <h3 class="text-base font-bold text-slate-900 dark:text-white">
              {{ title }}
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {{ message }}
            </p>
          </div>
        </div>

        <div class="mt-5 flex gap-2 sm:mt-6 sm:gap-3">
          <BaseButton
            variant="secondary"
            size="md"
            block
            @click="emit('cancel')"
          >
            {{ cancelText }}
          </BaseButton>
          <BaseButton
            :variant="confirmVariant"
            size="md"
            :loading="loading"
            block
            @click="emit('confirm')"
          >
            {{ confirmText }}
          </BaseButton>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.zoom-enter-active,
.zoom-leave-active {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease;
}
.zoom-enter-from,
.zoom-leave-to {
  transform: translate(-50%, -46%) scale(0.96);
  opacity: 0;
}
</style>
