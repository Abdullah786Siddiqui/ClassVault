<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'secondary', 'danger', 'ghost', 'ghost-invert', 'subtle'].includes(v),
  },
  size: {
    type: String,
    default: 'md',
    validator: (s) => ['xs', 'sm', 'md', 'lg'].includes(s),
  },
  type: {
    type: String,
    default: 'button',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  block: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['click'])

const variantClass = computed(() => `btn-${props.variant}`)
const sizeClass = computed(() => `btn-${props.size}`)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="btn"
    :class="[variantClass, sizeClass, block ? 'w-full' : '']"
    @click="emit('click', $event)"
  >
    <i v-if="loading" class="fa-solid fa-spinner fa-spin"></i>
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  font-family: var(--font-sans);
  font-weight: 600;
  border-radius: 0.75rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  white-space: nowrap;
  text-decoration: none;
  position: relative;
  overflow: hidden;
  line-height: 1.2;
}
.btn:focus-visible {
  outline: 2px solid #8b5cf6;
  outline-offset: 2px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* Sizes */
.btn-xs { min-height: 2rem; padding: 0.25rem 0.625rem; font-size: 0.75rem; border-radius: 0.5rem; }
.btn-sm { min-height: 2.375rem; padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
.btn-md { min-height: 2.625rem; padding: 0.5rem 1.125rem; font-size: 0.875rem; }
.btn-lg { min-height: 3rem; padding: 0.75rem 1.5rem; font-size: 1rem; border-radius: 1rem; }

/* Primary — violet gradient */
.btn-primary {
  background: linear-gradient(135deg, #8b5cf6, #6d28d9);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 14px rgba(109, 40, 217, 0.35);
}
.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #7c3aed, #5b21b6);
  box-shadow: 0 6px 20px rgba(109, 40, 217, 0.5);
  transform: translateY(-1px);
}
.btn-primary:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(109, 40, 217, 0.3);
}

/* Secondary — bordered */
.btn-secondary {
  background: var(--color-surface-card);
  color: var(--color-text);
  border-color: var(--color-border-strong);
}
.btn-secondary:hover:not(:disabled) {
  background: var(--color-surface-hover);
  border-color: var(--color-brand-500);
  color: var(--color-brand-400);
}

/* Danger */
.btn-danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  box-shadow: 0 4px 14px rgba(220, 38, 38, 0.3);
}
.btn-danger:hover:not(:disabled) {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  box-shadow: 0 6px 20px rgba(220, 38, 38, 0.45);
  transform: translateY(-1px);
}

/* Ghost */
.btn-ghost {
  background: transparent;
  color: var(--color-text-muted);
  border-color: transparent;
}
.btn-ghost:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.1);
  color: var(--color-brand-400);
}

/* Ghost Invert (for dark banners) */
.btn-ghost-invert {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(4px);
}
.btn-ghost-invert:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.25);
}

/* Subtle — violet tint */
.btn-subtle {
  background: rgba(139, 92, 246, 0.12);
  color: var(--color-brand-400);
  border-color: transparent;
}
.btn-subtle:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.2);
  color: var(--color-brand-300);
}

/* w-full helper */
.w-full { width: 100%; }
</style>
