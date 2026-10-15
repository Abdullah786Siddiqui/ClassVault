<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useItemStore } from '../stores/items'
import { useSemesterStore } from '../stores/semesters'
import { useAuthStore } from '../stores/auth'
import { registerBackgroundSync } from '../services/backgroundSync'
import { requestNotificationPermission } from '../services/notifications'
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
import WhatsAppSyncModal from '../components/domain/WhatsAppSyncModal.vue'
import { getWhatsAppMappings } from '../services/whatsapp'
import { syncIncomingWhatsAppItems } from '../services/whatsappSync'
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
const isWhatsAppOpen = ref(false)
const linkedGroup = ref(null)

async function refreshWhatsAppMapping() {
  try {
    const res = await getWhatsAppMappings()
    if (res?.ok && Array.isArray(res.mappings)) {
      const match = res.mappings.find(
        (m) =>
          Number(m.subjectId) === Number(route.params.subjectId) ||
          m.subject === subject.value?.name
      )
      linkedGroup.value = match || null
    } else {
      linkedGroup.value = null
    }
  } catch {
    linkedGroup.value = null
  }
}

async function loadSubjectPage() {
  loadError.value = ''
  try {
    await Promise.all([
      itemStore.loadSubjectItems(route.params.semesterId, route.params.subjectId, route.params.exam),
      semesterStore.load(),
      authStore.refreshPendingCount(),
      refreshWhatsAppMapping(),
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

let liveSyncTimer = null

async function checkWhatsAppSync() {
  await syncIncomingWhatsAppItems((newItem) => {
    if (
      Number(newItem.subjectId) === Number(route.params.subjectId) &&
      newItem.exam === route.params.exam
    ) {
      itemStore.loadSubjectItems(route.params.semesterId, route.params.subjectId, route.params.exam)
      toast.success(`📷 New ${newItem.type} received from WhatsApp group!`)
    }
  })
}

onMounted(() => {
  checkWhatsAppSync()
  liveSyncTimer = setInterval(checkWhatsAppSync, 3000)
})

onUnmounted(() => {
  if (liveSyncTimer) {
    clearInterval(liveSyncTimer)
    liveSyncTimer = null
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

    // Request system notification permission on first upload so progress shows in Android drawer
    requestNotificationPermission().catch(() => undefined)

    // ALWAYS register background sync immediately so Android Chrome finishes
    // remaining items in background even if the student closes or swipes away the app!
    registerBackgroundSync().catch(() => undefined)

    if (navigator.onLine && authStore.signedIn) {
      // Start syncing non-blockingly without freezing or requiring the user to wait
      authStore.syncNow().catch((err) => {
        console.warn('[ClassVault] Foreground sync error, background sync will continue:', err)
      })
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

      <!-- WhatsApp Link Button in page header -->
      <template #actions>
        <button
          v-if="linkedGroup"
          type="button"
          title="Linked to WhatsApp group. Click to change or unlink."
          class="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:border-emerald-500 transition-all shadow-xs cursor-pointer max-w-full"
          @click="isWhatsAppOpen = true"
        >
          <span class="relative flex h-2 w-2 shrink-0">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <i class="fa-brands fa-whatsapp text-emerald-600 dark:text-emerald-400 text-sm shrink-0"></i>
          <span class="truncate max-w-[140px] sm:max-w-[200px]">
            {{ linkedGroup.groupName }}
          </span>
          <span class="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 dark:bg-emerald-500/20 px-1.5 py-0.5 rounded-md shrink-0">
            Change
          </span>
        </button>

        <button
          v-else
          type="button"
          title="Link a WhatsApp group to auto-save files here"
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:border-emerald-500 transition-all cursor-pointer shrink-0"
          @click="isWhatsAppOpen = true"
        >
          <i class="fa-brands fa-whatsapp text-base text-emerald-500"></i>
          <span>Link to WhatsApp</span>
        </button>
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

    <!-- WhatsApp Group Link Modal -->
    <WhatsAppSyncModal
      :open="isWhatsAppOpen"
      :semester-id="route.params.semesterId"
      :subject-id="route.params.subjectId"
      :exam="route.params.exam"
      :semester-name="semester?.name || ''"
      :subject-name="subject?.name || ''"
      @updated="refreshWhatsAppMapping"
      @close="refreshWhatsAppMapping(); isWhatsAppOpen = false"
    />
  </div>
</template>
