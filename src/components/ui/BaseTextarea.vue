<script setup>
defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  id: {
    type: String,
    default: () => `textarea-${Math.random().toString(36).slice(2, 9)}`,
  },
  label: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  rows: {
    type: [Number, String],
    default: 5,
  },
  error: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  required: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="field">
    <label
      v-if="label"
      :for="id"
      class="field-label"
    >
      {{ label }}
      <span v-if="required" class="text-rose-500">*</span>
    </label>

    <div class="field-textarea-wrap" :class="{ 'has-error': error }">
      <textarea
        :id="id"
        :value="modelValue"
        :rows="rows"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        class="field-textarea"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    </div>

    <p v-if="error" class="field-error"><i class="fa-solid fa-circle-exclamation"></i> {{ error }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
  text-align: left;
}

.field-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.01em;
}

.field-textarea-wrap {
  position: relative;
  width: 100%;
}

.field-textarea {
  width: 100%;
  resize: vertical;
  min-height: 7rem;
  padding: 0.75rem 0.875rem;
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  line-height: 1.55;
  font-weight: 500;
  color: var(--color-text);
  background: var(--color-surface-card);
  border: 1.5px solid var(--color-border);
  border-radius: 0.75rem;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  caret-color: var(--color-brand-600);
  -webkit-tap-highlight-color: transparent;
  -webkit-appearance: none;
  appearance: none;
}

.field-textarea::placeholder {
  color: var(--color-text-faint);
  font-weight: 400;
}

.field-textarea:focus {
  border-color: var(--color-brand-500);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
  background: var(--color-surface-card);
}

.field-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.has-error .field-textarea {
  border-color: #ef4444;
}
.has-error .field-textarea:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

.field-error {
  font-size: 0.75rem;
  color: #f87171;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0;
}
</style>
