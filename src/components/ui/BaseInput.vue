<script setup>
defineProps({
  label: String,
  placeholder: String,
  modelValue: [String, Number],
  type: { type: String, default: 'text' },
  required: Boolean,
  autofocus: Boolean,
  error: String,
  hint: String,
  id: String,
})
defineEmits(['update:modelValue'])
</script>

<template>
  <div class="field">
    <label v-if="label" :for="id" class="field-label">{{ label }}</label>
    <div class="field-input-wrap" :class="{ 'has-error': error }">
      <input
        :id="id"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :required="required"
        :autofocus="autofocus"
        class="field-input"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    </div>
    <p v-if="error" class="field-error"><i class="fa-solid fa-circle-exclamation"></i> {{ error }}</p>
    <p v-else-if="hint" class="field-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.01em;
}

.field-input-wrap {
  position: relative;
}

.field-input {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.625rem 0.875rem;
  font-family: var(--font-sans);
  font-size: 0.9375rem;
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

.field-input::placeholder {
  color: var(--color-text-faint);
  font-weight: 400;
}

.field-input:focus {
  border-color: var(--color-brand-500);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
  background: var(--color-surface-card);
}

.has-error .field-input {
  border-color: #ef4444;
}
.has-error .field-input:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

.field-error {
  font-size: 0.75rem;
  color: #f87171;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.field-hint {
  font-size: 0.75rem;
  color: var(--color-text-faint);
}
</style>
