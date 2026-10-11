<script setup>
import { onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
})

const emit = defineEmits(['close'])

function handleKeyDown(event) {
  if (event.key === 'Escape' && props.open) emit('close')
}

watch(
  () => props.open,
  (isOpen) => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = isOpen ? 'hidden' : ''
    }
  },
)

onMounted(() => window.addEventListener('keydown', handleKeyDown))
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="fade">
      <div
        v-if="open"
        class="sheet-backdrop"
        aria-hidden="true"
        @click="emit('close')"
      />
    </Transition>

    <!-- Sheet panel -->
    <Transition name="slide-up">
      <div
        v-if="open"
        role="dialog"
        aria-modal="true"
        :aria-label="title || 'Modal sheet'"
        class="sheet-panel"
      >
        <!-- Drag handle (mobile only) -->
        <div class="sheet-handle-wrap">
          <div class="sheet-handle"></div>
        </div>

        <!-- Header -->
        <div class="sheet-header">
          <slot name="title">
            <h3 v-if="title" class="sheet-title">{{ title }}</h3>
          </slot>
          <button
            type="button"
            aria-label="Close sheet"
            class="sheet-close-btn"
            @click="emit('close')"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Scrollable content -->
        <div class="sheet-body safe-bottom">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(5, 4, 14, 0.75);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.sheet-panel {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 51;
  max-height: 92dvh;
  overflow: hidden;
  border-top-left-radius: 1.5rem;
  border-top-right-radius: 1.5rem;
  background: var(--color-surface-card);
  border-top: 1px solid var(--color-border-strong);
  box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

@media (min-width: 640px) {
  .sheet-panel {
    top: 50%; left: 50%;
    right: auto; bottom: auto;
    transform: translate(-50%, -50%);
    width: 100%;
    max-width: 30rem;
    max-height: 90dvh;
    border-radius: 1.25rem;
    border: 1px solid var(--color-border-strong);
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.1);
  }
}

.sheet-handle-wrap {
  display: flex;
  justify-content: center;
  padding: 0.75rem 0 0.25rem;
}
@media (min-width: 640px) {
  .sheet-handle-wrap { display: none; }
}

.sheet-handle {
  width: 2.5rem;
  height: 0.25rem;
  border-radius: 9999px;
  background: var(--color-border-strong);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.sheet-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.sheet-close-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: none;
  background: rgba(139, 92, 246, 0.1);
  color: var(--color-text-muted);
  font-size: 0.875rem;
  transition: all 0.15s ease;
  cursor: pointer;
}
.sheet-close-btn:hover {
  background: rgba(139, 92, 246, 0.2);
  color: var(--color-brand-400);
}

.sheet-body {
  overflow-y: auto;
  padding: 1.25rem;
  flex: 1;
}

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
@media (min-width: 640px) {
  .slide-up-enter-from, .slide-up-leave-to {
    transform: translate(-50%, -46%) scale(0.97);
    opacity: 0;
  }
}
</style>
