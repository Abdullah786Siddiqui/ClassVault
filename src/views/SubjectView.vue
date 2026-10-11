<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useItemStore } from '../stores/items'
import { useSemesterStore } from '../stores/semesters'
import { useAuthStore } from '../stores/auth'
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

onMounted(async () => {
  await Promise.all([
    itemStore.loadSubjectItems(route.params.semesterId, route.params.subjectId, route.params.exam),
    semesterStore.load(),
    authStore.refreshPendingCount(),
  ])
  if (!semester.value) {
    toast.error('Semester not found')
    router.replace('/')
  }
})

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

const activeItems = computed(() => {
  switch (activeTab.value) {
    case 'photo':
      return photosList.value
    case 'file':
      return filesList.value
    case 'text':
    default:
      return notesList.value
  }
})

async function handleSaveItem(payload) {
  try {
    await itemStore.addItem({
      ...payload,
      semesterId: route.params.semesterId,
      subjectId: route.params.subjectId,
      exam: route.params.exam,
    })

    activeTab.value = payload.type
    await authStore.refreshPendingCount()
    isAddSheetOpen.value = false
    toast.success('Saved. Uploading when online')

    // Trigger sync in background if online and connected
    if (navigator.onLine && authStore.signedIn) {
      authStore.syncNow().catch(() => undefined)
    }
  } catch (err) {
    toast.error(err?.message || 'Failed to save item to Vault')
  }
}

async function handleUpdateItem(id, changes) {
  try {
    await itemStore.updateItem(id, changes)
    if (viewingItem.value?.id === id) {
      viewingItem.value = { ...viewingItem.value, ...changes }
    }
    toast.success('Item updated')
  } catch (err) {
    toast.error('Failed to update item')
  }
}

function promptDeleteItem(item) {
  itemToDelete.value = item
}

async function confirmDeleteItem() {
  if (!itemToDelete.value) return
  const id = itemToDelete.value.id
  try {
    await itemStore.deleteItem(id)
    if (viewingItem.value?.id === id) {
      viewingItem.value = null
    }
    await authStore.refreshPendingCount()
    toast.success('Item deleted (removed from device & Drive)')
  } catch (err) {
    toast.error('Failed to delete item')
  } finally {
    itemToDelete.value = null
  }
}

function openViewer(item) {
  viewingItem.value = item
}

function handleDownloadFromDrive(item) {
  toast.info('Downloading file from Google Drive...')
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

    <!-- Floating Action Button for adding items -->
    <FabButton
      aria-label="Add note, photo, or file"
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
      @download="handleDownloadFromDrive"
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
