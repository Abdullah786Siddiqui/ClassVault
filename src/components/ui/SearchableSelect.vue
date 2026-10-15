<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  options: {
    type: Array,
    default: () => [],
    // items can be { id, name, participantsCount } OR { value, label, subtitle }
  },
  placeholder: {
    type: String,
    default: 'Select a WhatsApp group...',
  },
  searchPlaceholder: {
    type: String,
    default: 'Search WhatsApp groups...',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'select'])

const isOpen = ref(false)
const searchQuery = ref('')
const containerRef = ref(null)
const searchInputRef = ref(null)

// Normalize options to a standard shape
const normalizedOptions = computed(() => {
  return props.options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt, subtitle: '' }
    }
    return {
      value: opt.id ?? opt.value ?? '',
      label: opt.name ?? opt.label ?? opt.subject ?? 'Unnamed Group',
      subtitle: opt.participantsCount !== undefined 
        ? `${opt.participantsCount} members` 
        : (opt.subtitle || ''),
      raw: opt,
    }
  })
})

// Filtered options based on search query
const filteredOptions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return normalizedOptions.value
  return normalizedOptions.value.filter(opt => 
    opt.label.toLowerCase().includes(q) ||
    opt.subtitle.toLowerCase().includes(q)
  )
})

// Selected option object
const selectedOption = computed(() => {
  return normalizedOptions.value.find(opt => String(opt.value) === String(props.modelValue)) || null
})

function toggleDropdown() {
  if (props.disabled || props.loading) return
  if (isOpen.value) {
    closeDropdown()
  } else {
    openDropdown()
  }
}

function openDropdown() {
  isOpen.value = true
  searchQuery.value = ''
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function closeDropdown() {
  isOpen.value = false
  searchQuery.value = ''
}

function selectItem(opt) {
  emit('update:modelValue', opt.value)
  emit('select', opt.raw || opt)
  closeDropdown()
}

function handleKeydown(e) {
  if (e.key === 'Escape' && isOpen.value) {
    closeDropdown()
  }
}

function handleClickOutside(e) {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="containerRef" class="relative w-full text-left font-sans">
    <!-- Trigger Button -->
    <button
      type="button"
      :disabled="disabled || loading"
      class="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border text-sm font-medium transition-all duration-200 outline-none"
      :class="[
        isOpen 
          ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white dark:bg-slate-900 shadow-sm'
          : error 
            ? 'border-red-400 bg-red-50/40 dark:bg-red-950/20' 
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400 dark:hover:border-emerald-500/50 shadow-xs',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      ]"
      @click="toggleDropdown"
    >
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <!-- Icon -->
        <div 
          class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          :class="selectedOption 
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'"
        >
          <i v-if="loading" class="fa-solid fa-circle-notch fa-spin text-sm text-emerald-500"></i>
          <i v-else class="fa-brands fa-whatsapp text-base"></i>
        </div>

        <!-- Text preview -->
        <div class="flex flex-col min-w-0 text-left">
          <span 
            v-if="selectedOption" 
            class="font-semibold text-slate-800 dark:text-slate-100 truncate text-sm"
          >
            {{ selectedOption.label }}
          </span>
          <span 
            v-else 
            class="text-slate-400 dark:text-slate-500 text-sm truncate"
          >
            {{ loading ? 'Loading WhatsApp groups...' : placeholder }}
          </span>

          <span 
            v-if="selectedOption && selectedOption.subtitle" 
            class="text-[11px] text-slate-400 dark:text-slate-500 truncate"
          >
            {{ selectedOption.subtitle }}
          </span>
        </div>
      </div>

      <!-- Arrow Indicator -->
      <div class="flex items-center shrink-0 pl-1 text-slate-400">
        <i 
          class="fa-solid fa-chevron-down text-xs transition-transform duration-200"
          :class="{ 'rotate-180 text-emerald-500': isOpen }"
        ></i>
      </div>
    </button>

    <!-- Error message if any -->
    <p v-if="error" class="text-xs text-red-500 mt-1 flex items-center gap-1">
      <i class="fa-solid fa-circle-exclamation"></i> {{ error }}
    </p>

    <!-- Dropdown Panel -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="transform scale-95 opacity-0 -translate-y-1"
      enter-to-class="transform scale-100 opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="transform scale-100 opacity-100 translate-y-0"
      leave-to-class="transform scale-95 opacity-0 -translate-y-1"
    >
      <div
        v-if="isOpen"
        class="absolute left-0 right-0 z-50 mt-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl shadow-slate-950/15 overflow-hidden flex flex-col"
        style="max-height: 320px;"
      >
        <!-- Search bar input inside dropdown -->
        <div class="p-2.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/90 backdrop-blur-xs">
          <div class="relative flex items-center">
            <i class="fa-solid fa-magnifying-glass absolute left-3 text-xs text-slate-400"></i>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              :placeholder="searchPlaceholder"
              class="w-full pl-8 pr-7 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              @click.stop
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-0.5"
              @click="searchQuery = ''"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Options list -->
        <div class="overflow-y-auto flex-1 p-1.5 space-y-1 custom-scrollbar">
          <!-- Loading state -->
          <div v-if="loading" class="py-6 flex flex-col items-center justify-center gap-2 text-slate-400">
            <i class="fa-solid fa-circle-notch fa-spin text-emerald-500 text-lg"></i>
            <span class="text-xs">Fetching WhatsApp groups...</span>
          </div>

          <!-- Empty list state -->
          <div v-else-if="filteredOptions.length === 0" class="py-7 px-4 text-center">
            <div class="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-400">
              <i class="fa-solid fa-users-slash text-sm"></i>
            </div>
            <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {{ searchQuery ? 'No groups matching "' + searchQuery + '"' : 'No WhatsApp groups found' }}
            </p>
            <p class="text-[11px] text-slate-400 mt-0.5">
              {{ searchQuery ? 'Try searching with a different keyword' : 'Make sure your WhatsApp has active groups' }}
            </p>
          </div>

          <!-- Options -->
          <button
            v-for="opt in filteredOptions"
            :key="opt.value"
            type="button"
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer group"
            :class="String(opt.value) === String(modelValue)
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-semibold'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200'"
            @click="selectItem(opt)"
          >
            <!-- WhatsApp group avatar/badge -->
            <div 
              class="w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 transition-colors"
              :class="String(opt.value) === String(modelValue)
                ? 'bg-emerald-500 text-white shadow-xs'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white'"
            >
              <i class="fa-brands fa-whatsapp text-sm"></i>
            </div>

            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium truncate leading-tight">
                {{ opt.label }}
              </p>
              <p v-if="opt.subtitle" class="text-[10px] text-slate-400 leading-tight mt-0.5">
                {{ opt.subtitle }}
              </p>
            </div>

            <!-- Checkmark icon if selected -->
            <div v-if="String(opt.value) === String(modelValue)" class="shrink-0 text-emerald-600 dark:text-emerald-400">
              <i class="fa-solid fa-circle-check text-sm"></i>
            </div>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}
</style>
