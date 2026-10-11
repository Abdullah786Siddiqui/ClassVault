<script setup>
import { ref, watch, computed } from 'vue'
import { useToast } from '../../composables/useToast'
import BottomSheet from '../ui/BottomSheet.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseTextarea from '../ui/BaseTextarea.vue'
import { formatFileSize } from '../../utils/format'
import { FileText, Camera, UploadCloud, Image as ImageIcon, FileUp, X } from '../ui/icons.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  initialType: {
    type: String,
    default: 'text',
    validator: (v) => ['text', 'photo', 'file'].includes(v),
  },
})

const emit = defineEmits(['close', 'save'])
const toast = useToast()

const activeType = ref(props.initialType)
const title = ref('')
const noteText = ref('')
const caption = ref('')
const selectedFile = ref(null)
const previewUrl = ref('')
const cameraInputRef = ref(null)
const galleryInputRef = ref(null)
const fileInputRef = ref(null)

const sheetTitle = computed(() => {
  const typeLabels = {
    text: 'Add note',
    photo: 'Add photo',
    file: 'Add file',
  }
  return typeLabels[activeType.value] || 'Add to Subject'
})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      activeType.value = props.initialType || 'text'
      resetForm()
    } else {
      clearPreview()
    }
  },
)

watch(
  () => props.initialType,
  (type) => {
    if (type) activeType.value = type
  },
)

function resetForm() {
  title.value = ''
  noteText.value = ''
  caption.value = ''
  selectedFile.value = null
  clearPreview()
}

function clearPreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

function handleFileSelection(event) {
  const file = event.target.files?.[0]
  if (!file) return

  if (file.size > MAX_FILE_SIZE) {
    toast.error('File size exceeds 25MB limit. Please select a smaller file.')
    event.target.value = ''
    return
  }

  selectedFile.value = file
  clearPreview()

  if (file.type.startsWith('image/')) {
    previewUrl.value = URL.createObjectURL(file)
  }
}

function triggerCamera() {
  cameraInputRef.value?.click()
}

function triggerGallery() {
  galleryInputRef.value?.click()
}

function triggerFilePicker() {
  fileInputRef.value?.click()
}

const canSave = computed(() => {
  if (activeType.value === 'text') {
    return Boolean(noteText.value.trim())
  }
  return Boolean(selectedFile.value)
})

function handleSave() {
  if (!canSave.value) return

  if (activeType.value === 'text') {
    const noteTitle = title.value.trim() || 'Note'
    emit('save', {
      type: 'text',
      title: noteTitle,
      text: noteText.value.trim(),
      fileName: `${noteTitle}.txt`,
      mimeType: 'text/plain',
    })
    return
  }

  const file = selectedFile.value
  let targetFileName = file.name
  if (title.value.trim()) {
    const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/)
    const ext = extMatch ? `.${extMatch[1]}` : ''
    targetFileName = `${title.value.trim()}${ext}`
  }

  emit('save', {
    type: activeType.value,
    title: title.value.trim() || file.name,
    caption: caption.value.trim(),
    blob: file,
    fileName: targetFileName,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
  })
}
</script>

<template>
  <BottomSheet :open="open" :title="sheetTitle" @close="emit('close')">
    <div class="space-y-4">
      <!-- Text Note Form -->
      <div v-if="activeType === 'text'" class="space-y-3 pt-1">
        <BaseInput
          v-model="title"
          label="Title (optional)"
          placeholder="e.g. Chapter 3 Summary, Formulae"
        />

        <BaseTextarea
          v-model="noteText"
          label="Note Content"
          placeholder="Write the key concept, question, or note..."
          :rows="6"
          required
        />
      </div>

      <!-- Photo Form (Two Distinct Buttons for Camera and Gallery) -->
      <div v-else-if="activeType === 'photo'" class="space-y-4 pt-1">
        <!-- Hidden file inputs -->
        <input
          ref="cameraInputRef"
          type="file"
          accept="image/*"
          capture="environment"
          class="hidden"
          @change="handleFileSelection"
        />
        <input
          ref="galleryInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleFileSelection"
        />

        <!-- Two big action buttons if no photo selected yet -->
        <div v-if="!selectedFile" class="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-3.5 text-center transition-all hover:border-indigo-500 hover:bg-indigo-50 active:scale-98 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:hover:border-indigo-500 sm:gap-2.5 sm:rounded-2xl sm:p-6"
            @click="triggerCamera"
          >
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30 sm:h-12 sm:w-12 sm:rounded-2xl">
              <Camera class="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <span class="text-sm font-bold text-slate-900 dark:text-white">Take photo</span>
            <span class="text-xs text-slate-500 dark:text-slate-400">Back camera</span>
          </button>

          <button
            type="button"
            class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-3.5 text-center transition-all hover:border-indigo-500 hover:bg-slate-100 active:scale-98 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-indigo-500 sm:gap-2.5 sm:rounded-2xl sm:p-6"
            @click="triggerGallery"
          >
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-700 text-white shadow-md dark:bg-slate-800 sm:h-12 sm:w-12 sm:rounded-2xl">
              <ImageIcon class="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <span class="text-sm font-bold text-slate-900 dark:text-white">Choose gallery</span>
            <span class="text-xs text-slate-500 dark:text-slate-400">Photos & files</span>
          </button>
        </div>

        <!-- Preview if photo is selected -->
        <div v-else class="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
          <img
            v-if="previewUrl"
            :src="previewUrl"
            alt="Preview"
            class="max-h-52 w-full object-cover"
          />
          <div class="flex items-center justify-between p-3">
            <div class="min-w-0">
              <p class="truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                {{ selectedFile.name }}
              </p>
              <p class="text-[11px] text-slate-400">
                {{ formatFileSize(selectedFile.size) }}
              </p>
            </div>
            <button
              type="button"
              class="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-rose-100 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-rose-950"
              @click="selectedFile = null; clearPreview()"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>

        <BaseInput
          v-model="caption"
          label="Caption (optional)"
          placeholder="e.g. Blackboard summary, lecture slide 4"
        />
      </div>

      <!-- File Form -->
      <div v-else-if="activeType === 'file'" class="space-y-4 pt-1">
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          @change="handleFileSelection"
        />

        <div
          v-if="!selectedFile"
          class="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-8 text-center transition-colors hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900/40"
          @click="triggerFilePicker"
        >
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <FileUp class="h-6 w-6" />
          </div>
          <div>
            <p class="text-sm font-bold text-slate-800 dark:text-slate-200">
              Select any document or handout
            </p>
            <p class="text-xs text-slate-400">PDF, Word, Slides, Archive</p>
          </div>
          <BaseButton variant="subtle" size="sm" @click.stop="triggerFilePicker">
            Browse files
          </BaseButton>
        </div>

        <div v-else class="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div class="min-w-0">
            <p class="truncate text-sm font-bold text-slate-900 dark:text-white">
              {{ selectedFile.name }}
            </p>
            <p class="text-xs text-slate-400">
              {{ formatFileSize(selectedFile.size) }}
            </p>
          </div>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
            @click="selectedFile = null"
          >
            <X class="h-5 w-5" />
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-3">
        <BaseButton
          variant="secondary"
          block
          @click="emit('close')"
        >
          Cancel
        </BaseButton>
        <BaseButton
          variant="primary"
          block
          :disabled="!canSave"
          @click="handleSave"
        >
          Save to Vault
        </BaseButton>
      </div>
    </div>
  </BottomSheet>
</template>
