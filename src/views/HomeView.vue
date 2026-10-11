<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSemesterStore } from '../stores/semesters'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../composables/useToast'
import SyncBanner from '../components/layout/SyncBanner.vue'
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

    <!-- Sync Banner -->
    <SyncBanner />

    <!-- Semesters Section Header & Search -->
    <div class="library-section-heading flex-col gap-3 sm:flex-row sm:items-center">
      <div>
        <h2 class="text-xl font-extrabold tracking-tight sm:text-2xl" style="color: var(--color-text)">
          Academic Semesters
        </h2>
        <p class="text-xs font-medium" style="color: var(--color-text-muted)">
          {{ semesterStore.semesters.length }} {{ semesterStore.semesters.length === 1 ? 'semester' : 'semesters' }} recorded
        </p>
      </div>

      <div class="flex w-full items-center gap-2 sm:w-auto">
        <!-- Search filter if user has multiple semesters -->
        <div
          v-if="semesterStore.semesters.length > 2"
          class="relative flex-1 sm:w-52"
        >
          <Search class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Filter terms..."
            class="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500"
          />
        </div>

        <BaseButton
          variant="primary"
          size="sm"
          class="shrink-0"
          @click="isAddSheetOpen = true"
        >
          <Plus class="h-4 w-4" />
          <span>Add semester</span>
        </BaseButton>
      </div>
    </div>

    <div v-if="isLoading" class="flex min-h-48 items-center justify-center" role="status" aria-live="polite">
      <span class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></span>
      <span class="sr-only">Loading semesters</span>
    </div>
    <div v-else-if="loadError" class="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-900/50 dark:bg-rose-950/20" role="alert">
      <p class="text-sm font-semibold text-rose-800 dark:text-rose-200">{{ loadError }}</p>
      <BaseButton variant="secondary" size="sm" class="mt-3" @click="loadHome">Try again</BaseButton>
    </div>

    <!-- Semester Grid -->
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

    <!-- Filtered Empty State -->
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

    <!-- Empty State -->
    <EmptyState
      v-else
      :icon="GraduationCap"
      title="No semesters added yet"
      description="Create your first semester to organize subjects, lecture notes, board photos, and handouts."
      action-label="Create your first semester"
      @action="isAddSheetOpen = true"
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
