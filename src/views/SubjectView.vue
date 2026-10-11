<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useItemStore } from '../stores/items'
import { useSemesterStore } from '../stores/semesters'
import { useAuthStore } from '../stores/auth'
import { registerBackgroundSync } from '../services/backgroundSync'
import { useToast } from '../composables/useToast'
import PageHeader from '../components/ui/PageHeader.vue'
import SegmentedTabs from '../components/ui/SegmentedTabs.vue'
import FabButton from '../components/ui/FabButton.vue'
import NoteCard from '../components/domain/NoteCard.vue'
import PhotoCard from '../components/domain/PhotoCard.vue'
import FileRow from '../components/domain/FileRow.vue'
import AddItemSheet from '../components/domain/AddItemSheet.vue'
import ItemViewer from '../components/domain/ItemViewer.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import ConfirmDialog from '../components/ui/ConfirmDialog.vue'
import { FileText, Camera, UploadCloud } from '../components/ui/icons.js'

const route = useRoute()
const router = useRouter()
const itemStore = useItemStore()
const semesterStore = useSemesterStore()
const authStore = useAuthStore()
const toast = useToast()

const activeTab = ref('text')
const isAddSheetOpen = ref(false)
const viewingItem = ref(null)
const itemToDelete = ref(null)
const loadError = ref('')

async function loadSubjectPage() {
  loadError.value = ''
  try {
    await Promise.all([
      itemStore.loadSubjectItems(route.params.semesterId, route.params.subjectId, route.params.exam),
      semesterStore.load(),
      authStore.refreshPendingCount(),
    ])
    if (!semester.value) {
      toast.error('Semester not found.')
      router.replace('/')
    } else if (!subject.value) {
      toast.error('Subject not found.')
      router.replace(`/semester/${route.params.semesterId}/${route.params.exam}`)
    }
  } catch (error) {
    loadError.value = error?.message || 'Could not load this subject.'
    toast.error(loadError.value)
  }
}

watch(
  () => [route.params.semesterId, route.params.subjectId, route.params.exam],
  loadSubjectPage,
  { immediate: true },
)

const examType = computed(() => route.params.exam || '')

const semester = computed(() =>
  semesterStore.semesters.find((item) => item.id === Number(route.params.semesterId)),
)
const subject = computed(() =>
  semesterStore.subjects.find((item) => item.id === Number(route.params.subjectId)),
)
const examLabel = computed(() => {
  const match = semester.value?.exams?.find((e) => e.id === examType.value)
  if (match) return match.name
  if (examType.value === 'mid') return 'Mid'
  if (examType.value === 'final') return 'Final'
  return examType.value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
})

const allSubjectItems = computed(() => {
  return itemStore.items
    .filter(
      (item) =>
        item.semesterId === Number(route.params.semesterId) &&
        item.subjectId === Number(route.params.subjectId) &&
        item.exam === route.params.exam,
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

const notesList = computed(() => allSubjectItems.value.filter((i) => i.type === 'text'))
const photosList = computed(() => allSubjectItems.value.filter((i) => i.type === 'photo'))
const filesList = computed(() => allSubjectItems.value.filter((i) => i.type === 'file'))

const tabs = computed(() => [
  { value: 'text', label: 'Notes', count: notesList.value.length, icon: FileText },
  { value: 'photo', label: 'Photos', count: photosList.value.length, icon: Camera },
  { value: 'file', label: 'Files', count: filesList.value.length, icon: UploadCloud },
])

async function handleSaveItem(payload) {
  try {
    const payloads = (Array.isArray(payload) ? payload : [payload]).map((item) => ({
      ...item,
      semesterId: route.params.semesterId,
      subjectId: route.params.subjectId,
      exam: route.params.exam,
    }))
    await itemStore.addItems(payloads)

    activeTab.value = payloads[0].type
    await authStore.refreshPendingCount()
    isAddSheetOpen.value = false
    toast.success(
      payloads.length > 1
        ? `Saved ${payloads.length} photos on this device.`
        : 'Saved on this device.',
    )

    if (navigator.onLine && authStore.signedIn) {
      const result = await authStore.syncNow()
      if (!result.ok || result.mirrorError) {
        toast.error(result.reason || result.mirrorError || 'Could not sync the saved item.')
      }
    } else if (!navigator.onLine && authStore.signedIn) {
      const scheduled = await registerBackgroundSync()
      toast.info(
        scheduled
          ? 'Background upload is scheduled. It will run when your connection returns if this browser supports it.'
          : 'Saved locally. Open ClassVault while online to upload on this browser.',
      )
    } else {
      toast.info('Saved locally. Connect Google Drive to upload this item.')
    }
  } catch (err) {
    toast.error(err?.message || 'Failed to save item to Vault')
  }
}

async function handleUpdateItem(id, changes) {
  try {
    const item = itemStore.items.find((candidate) => candidate.id === id)
    const updates = { ...changes }
    if (item?.type === 'text' && updates.title) {
      updates.fileName = `${updates.title}.txt`
    }
    await itemStore.updateItem(id, updates)
    if (viewingItem.value?.id === id) {
      viewingItem.value = { ...viewingItem.value, ...updates }
    }
    await authStore.refreshPendingCount()
    toast.success(item?.driveFileId ? 'Changes saved. Syncing to Google Drive.' : 'Item updated')
    if (navigator.onLine && authStore.signedIn) {
      const result = await authStore.syncNow()
      if (!result.ok || result.mirrorError) {
        toast.error(result.reason || result.mirrorError || 'Could not sync the updated item.')
      }
    }
  } catch (err) {
    toast.error(err?.message || 'Failed to update item.')
  }
}

function promptDeleteItem(item) {
  itemToDelete.value = item
}

async function confirmDeleteItem() {
  if (!itemToDelete.value) return
  const item = itemToDelete.value
  const id = item.id
  try {
    await itemStore.deleteItem(id)
    if (viewingItem.value?.id === id) {
      viewingItem.value = null
    }
    await authStore.refreshPendingCount()
    toast.success(item.driveFileId ? 'Item deleted from this device and Google Drive.' : 'Item deleted from this device.')
  } catch (err) {
    toast.error(err?.message || 'Failed to delete item.')
  } finally {
    itemToDelete.value = null
  }
}

function openViewer(item) {
  viewingItem.value = item
}

</script>

<template>
  <div class="mx-auto max-w-6xl pb-6 sm:pb-10">
    <!-- Header with Breadcrumb -->
    <PageHeader
      :title="subject?.name || 'Subject Notes'"
      show-back
      :back-to="`/semester/${route.params.semesterId}/${route.params.exam}`"
    >
      <template #subtitle>
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-bold text-slate-400 dark:text-slate-500">
            {{ semester?.name || 'Semester' }}
          </span>
          <span class="text-xs text-slate-300 dark:text-slate-600">·</span>
          <span
            class="rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
            :class="
              examType === 'mid'
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
            "
          >
            {{ examLabel }}
          </span>
        </div>
      </template>
    </PageHeader>

    <div v-if="loadError" class="mx-auto mt-8 max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-900/50 dark:bg-rose-950/20" role="alert">
      <p class="text-sm font-semibold text-rose-800 dark:text-rose-200">{{ loadError }}</p>
      <button
        type="button"
        class="mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
        @click="loadSubjectPage"
      >
        Try again
      </button>
    </div>

    <div v-else-if="itemStore.loading" class="flex min-h-48 items-center justify-center" role="status" aria-live="polite">
      <span class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></span>
      <span class="sr-only">Loading items</span>
    </div>

    <div v-else>
      <!-- Segmented Filter Tabs -->
      <div class="mb-5">
        <SegmentedTabs v-model="activeTab" :tabs="tabs" />
      </div>

      <!-- Notes Tab -->
      <div v-if="activeTab === 'text'">
      <div v-if="notesList.length" class="space-y-3">
        <NoteCard
          v-for="item in notesList"
          :key="item.id"
          :item="item"
          @open="openViewer"
          @edit="openViewer"
          @delete="promptDeleteItem"
        />
      </div>
      <EmptyState
        v-else
        :icon="FileText"
        title="No notes yet"
        description="Write quick notes, formula summaries, or teacher key points."
        action-label="Write a note"
        @action="isAddSheetOpen = true"
      />
      </div>

      <!-- Photos Tab -->
      <div v-else-if="activeTab === 'photo'">
      <div
        v-if="photosList.length"
        class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        <PhotoCard
          v-for="item in photosList"
          :key="item.id"
          :item="item"
          @open="openViewer"
          @delete="promptDeleteItem"
        />
      </div>
      <EmptyState
        v-else
        :icon="Camera"
        title="No photos yet"
        description="Snap blackboard notes with your camera or upload from gallery."
        action-label="Take or pick photo"
        @action="isAddSheetOpen = true"
      />
      </div>

      <!-- Files Tab -->
      <div v-else-if="activeTab === 'file'">
      <div v-if="filesList.length" class="space-y-2.5">
        <FileRow
          v-for="item in filesList"
          :key="item.id"
          :item="item"
          @open="openViewer"
          @delete="promptDeleteItem"
        />
      </div>
      <EmptyState
        v-else
        :icon="UploadCloud"
        title="No files attached"
        description="Store PDFs, slides, assignments, and exam review sheets."
        action-label="Attach a file"
        @action="isAddSheetOpen = true"
      />
      </div>
    </div>

    <!-- Floating action button for adding items -->
    <FabButton
      aria-label="Add note, photo, or file"
      v-if="!itemStore.loading && !loadError"
      @click="isAddSheetOpen = true"
    />

    <!-- Add Item BottomSheet -->
    <AddItemSheet
      :open="isAddSheetOpen"
      :initial-type="activeTab"
      @close="isAddSheetOpen = false"
      @save="handleSaveItem"
    />

    <!-- Item Viewer / Editor Modal -->
    <ItemViewer
      :item="viewingItem"
      @close="viewingItem = null"
      @update="handleUpdateItem"
      @delete="promptDeleteItem"
    />

    <!-- Delete Confirmation Dialog -->
    <ConfirmDialog
      :open="Boolean(itemToDelete)"
      title="Delete Item?"
      message="Are you sure you want to delete this item? It will be permanently removed from your device and Google Drive."
      confirm-text="Delete Item"
      confirm-variant="danger"
      @confirm="confirmDeleteItem"
      @cancel="itemToDelete = null"
    />
  </div>
</template>
