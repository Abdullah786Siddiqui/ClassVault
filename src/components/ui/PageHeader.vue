<script setup>
import { useRouter } from 'vue-router'
import { ArrowLeft } from './icons.js'
import IconButton from './IconButton.vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  backTo: {
    type: [String, Object],
    default: '',
  },
  showBack: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['back'])
const router = useRouter()

function handleBack() {
  emit('back')
  if (props.backTo) {
    router.push(props.backTo)
  } else {
    router.back()
  }
}
</script>

<template>
  <header class="mb-5 flex items-center justify-between gap-3">
    <div class="flex items-center gap-3 min-w-0">
      <IconButton
        v-if="showBack"
        :icon="ArrowLeft"
        aria-label="Go back"
        variant="secondary"
        size="sm"
        class="shrink-0"
        @click="handleBack"
      />
      <div class="min-w-0">
        <slot name="subtitle">
          <p
            v-if="subtitle"
            class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 truncate"
          >
            {{ subtitle }}
          </p>
        </slot>
        <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
          {{ title }}
        </h1>
      </div>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <slot />
    </div>
  </header>
</template>
