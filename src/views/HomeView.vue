<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSemesterStore } from '../stores/semesters'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../composables/useToast'
import SemesterCard from '../components/domain/SemesterCard.vue'
import BottomSheet from '../components/ui/BottomSheet.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import ConfirmDialog from '../components/ui/ConfirmDialog.vue'
import { Plus, GraduationCap, BookOpen, ShieldCheck, Search } from '../components/ui/icons.js'

const router = useRouter()
const semesterStore = useSemesterStore()
const authStore = useAuthStore()
const toast = useToast()

const isAddSheetOpen = ref(false)
const newSemesterName = ref('')
const isCreating = ref(false)
const semesterToDelete = ref(null)
const searchQuery = ref('')
const isLoading = ref(true)
const loadError = ref('')

async function loadHome() {
  isLoading.value = true
  loadError.value = ''
  try {
    await Promise.all([semesterStore.load(), authStore.refreshPendingCount()])
  } catch (error) {
    loadError.value = error?.message || 'Could not load your study library.'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadHome)

const filteredSemesters = computed(() => {
  if (!searchQuery.value.trim()) return semesterStore.semesters
  const q = searchQuery.value.trim().toLowerCase()
  return semesterStore.semesters.filter((s) => s.name.toLowerCase().includes(q))
})

function openSemester(id) {
  router.push(`/semester/${id}`)
}

async function handleCreateSemester() {
  const name = newSemesterName.value.trim()
  if (!name) return

  isCreating.value = true
  try {
    const id = await semesterStore.addSemester(name)
    if (id) {
      newSemesterName.value = ''
      isAddSheetOpen.value = false
      toast.success(`Created "${name}"`)
    }
  } catch (err) {
    toast.error(err?.message || 'Failed to create semester')
  } finally {
    isCreating.value = false
  }
}

async function handleConnectDrive() {
  const result = await authStore.connectGoogle()
  if (result.ok) {
    toast.success('Google Drive connected!')
    await loadHome()
  } else {
    toast.error(result.message || 'Could not connect Google Drive')
  }
}

function openAddSemester() {
  if (!authStore.canAddData) {
    toast.info('Please connect your Google Drive first.')
    handleConnectDrive()
    return
  }
  isAddSheetOpen.value = true
}

function promptDeleteSemester(semester) {
  semesterToDelete.value = semester
}

async function confirmDeleteSemester() {
  if (!semesterToDelete.value) return
  const name = semesterToDelete.value.name
  try {
    await semesterStore.deleteSemester(semesterToDelete.value.id)
    toast.success(`Deleted "${name}".`)
  } catch (err) {
    toast.error(err?.message || 'Failed to delete semester.')
  } finally {
    semesterToDelete.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl pb-6 sm:pb-10">
    <!-- Welcome Hero -->
    <section class="library-welcome">
      <div class="library-welcome-copy">
        <p class="library-eyebrow">YOUR STUDY LIBRARY</p>
        <h1>Your studies, all in one place.</h1>
        <p>Keep notes, class photos, and handouts organized by semester. Find what you need and pick up where you left off.</p>
      </div>
      <div class="library-welcome-art" aria-hidden="true">
        <i class="fa-solid fa-book-open"></i>
        <span class="welcome-spark welcome-spark-one"></span>
        <span class="welcome-spark welcome-spark-two"></span>
      </div>
    </section>

    <!-- Semesters Section Header & Search (ONLY when Drive connected!) -->
    <div v-if="authStore.canAddData" class="mb-5 flex flex-col gap-3">
      <!-- Title + Add Semester Button in ONE Row on mobile and desktop -->
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-lg font-extrabold tracking-tight sm:text-2xl" style="color: var(--color-text)">
            Semesters
          </h2>
          <p class="truncate text-xs font-medium" style="color: var(--color-text-muted)">
            {{ semesterStore.semesters.length }} {{ semesterStore.semesters.length === 1 ? 'semester' : 'semesters' }} recorded
          </p>
        </div>

        <BaseButton
          variant="primary"
          size="sm"
          class="shrink-0 whitespace-nowrap cursor-pointer"
          @click="openAddSemester"
        >
          <Plus class="h-4 w-4" />
          <span>Add semester</span>
        </BaseButton>
      </div>

      <!-- Search filter if user has multiple semesters -->
      <div
        v-if="semesterStore.semesters.length > 2"
        class="relative w-full sm:max-w-xs"
      >
        <Search class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Filter semesters..."
          class="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500"
        />
      </div>
    </div>

    <!-- 1. Google Drive Not Connected: Show ONLY the Onboarding Gate! -->
    <div
      v-if="!authStore.canAddData"
      class="rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/50 p-6 sm:p-10 text-center shadow-sm dark:border-indigo-900/40 dark:from-slate-900 dark:via-slate-900/80 dark:to-indigo-950/20 space-y-4"
    >
      <div class="w-16 h-16 mx-auto rounded-3xl bg-indigo-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/30">
        <i class="fa-solid fa-cloud-arrow-up"></i>
      </div>
      <div class="space-y-1.5 max-w-md mx-auto">
        <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100">
          Connect Google Drive to Start
        </h3>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          ClassVault stores all your semester notes, board photos, and handouts directly in your personal Google Drive so you never lose them. Please connect once to get started.
        </p>
      </div>
      <div class="pt-2">
        <BaseButton
          variant="primary"
          size="lg"
          class="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/25 px-6 py-3 rounded-2xl font-bold inline-flex items-center gap-2 cursor-pointer"
          :disabled="authStore.reconnecting"
          @click="handleConnectDrive"
        >
          <i class="fa-brands fa-google mr-1"></i>
          <span>{{ authStore.reconnecting ? 'Connecting...' : 'Connect Google Drive' }}</span>
        </BaseButton>
      </div>
    </div>

    <!-- 2. Loading State -->
    <div v-else-if="isLoading" class="flex min-h-48 items-center justify-center" role="status" aria-live="polite">
      <span class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></span>
      <span class="sr-only">Loading semesters</span>
    </div>

    <!-- 3. Error State -->
    <div v-else-if="loadError" class="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-900/50 dark:bg-rose-950/20" role="alert">
      <p class="text-sm font-semibold text-rose-800 dark:text-rose-200">{{ loadError }}</p>
      <BaseButton variant="secondary" size="sm" class="mt-3" @click="loadHome">Try again</BaseButton>
    </div>

    <!-- 4. Semester Grid -->
    <div
      v-else-if="filteredSemesters.length"
      class="grid gap-4 sm:grid-cols-2"
    >
      <SemesterCard
        v-for="semester in filteredSemesters"
        :key="semester.id"
        :semester="semester"
        :subject-count="semesterStore.getSubjectsForSemester(semester.id).length"
        @open="openSemester"
        @delete="promptDeleteSemester"
      />
    </div>

    <!-- 5. Filtered Empty State -->
    <div
      v-else-if="semesterStore.semesters.length && !filteredSemesters.length"
      class="rounded-3xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900"
    >
      <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">
        No semesters matching "{{ searchQuery }}"
      </p>
      <BaseButton
        variant="ghost"
        size="sm"
        class="mt-3"
        @click="searchQuery = ''"
      >
        Clear filter
      </BaseButton>
    </div>

    <!-- 6. Empty State (When Drive connected but 0 semesters) -->
    <EmptyState
      v-else
      :icon="GraduationCap"
      title="No semesters added yet"
      description="Create your first semester to organize subjects, lecture notes, board photos, and handouts."
      action-label="Create your first semester"
      @action="openAddSemester"
    />

    <!-- Add Semester BottomSheet -->
    <BottomSheet
      :open="isAddSheetOpen"
      title="New Semester"
      @close="isAddSheetOpen = false"
    >
      <form @submit.prevent="handleCreateSemester" class="space-y-4">
        <BaseInput
          v-model="newSemesterName"
          label="Semester Name"
          placeholder="e.g. Semester 5, Fall 2024"
          required
          autofocus
        />

        <div class="flex gap-3 pt-2">
          <BaseButton
            variant="secondary"
            block
            @click="isAddSheetOpen = false"
          >
            Cancel
          </BaseButton>
          <BaseButton
            type="submit"
            variant="primary"
            block
            :loading="isCreating"
            :disabled="!newSemesterName.trim()"
          >
            Create
          </BaseButton>
        </div>
      </form>
    </BottomSheet>

    <!-- Delete Confirmation Dialog -->
    <ConfirmDialog
      :open="Boolean(semesterToDelete)"
      title="Delete Semester?"
      :message="`Are you sure you want to delete '${semesterToDelete?.name}' and all its subjects? All notes, photos, and files under it will also be permanently deleted from Google Drive.`"
      confirm-text="Delete semester"
      confirm-variant="danger"
      @confirm="confirmDeleteSemester"
      @cancel="semesterToDelete = null"
    />
  </div>
</template>
