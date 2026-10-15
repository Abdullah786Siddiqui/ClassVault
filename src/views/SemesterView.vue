<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSemesterStore } from '../stores/semesters'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../composables/useToast'
import PageHeader from '../components/ui/PageHeader.vue'
import ExamCard from '../components/domain/ExamCard.vue'
import SubjectCard from '../components/domain/SubjectCard.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import ConfirmDialog from '../components/ui/ConfirmDialog.vue'
import BottomSheet from '../components/ui/BottomSheet.vue'
import { Plus, BookOpen, Calendar, Folder } from '../components/ui/icons.js'

const route = useRoute()
const router = useRouter()
const semesterStore = useSemesterStore()
const authStore = useAuthStore()
const toast = useToast()

const subjectName = ref('')
const isAddingSubject = ref(false)
const isManagingSubjects = ref(false)
const isSavingSubject = ref(false)
const subjectToDelete = ref(null)
const subjectToRename = ref(null)
const renameName = ref('')
const loadError = ref('')

// Term state (Zero hardcoded terms)
const isAddingTerm = ref(false)
const newTermName = ref('')
const isCreatingTerm = ref(false)
const termToDelete = ref(null)

async function loadSemester() {
  loadError.value = ''
  try {
    await semesterStore.load()
    if (!semester.value) {
      toast.error('Semester not found.')
      router.replace('/')
    }
  } catch (error) {
    loadError.value = error?.message || 'Could not load this semester.'
  }
}

watch(() => route.params.semesterId, loadSemester, { immediate: true })

const semester = computed(() =>
  semesterStore.semesters.find((item) => item.id === Number(route.params.semesterId)),
)

const subjectList = computed(() =>
  semesterStore.getSubjectsForSemester(route.params.semesterId),
)

// Zero hardcoded terms - only what student explicitly adds
const currentExams = computed(() => {
  return semester.value?.exams || []
})

function openExam(examId) {
  router.push(`/semester/${route.params.semesterId}/${examId}`)
}

async function handleAddTerm() {
  const name = newTermName.value.trim()
  if (!name) return

  if (!authStore.canAddData) {
    toast.error('Please connect your Google Drive first.')
    return
  }

  isCreatingTerm.value = true
  try {
    await semesterStore.addExamToSemester(route.params.semesterId, name)
    toast.success(`Added term "${name}"`)
    newTermName.value = ''
    isAddingTerm.value = false
  } catch (err) {
    toast.error(err.message || 'Failed to add term')
  } finally {
    isCreatingTerm.value = false
  }
}

function promptDeleteTerm(term) {
  termToDelete.value = term
}

async function confirmDeleteTerm() {
  if (!termToDelete.value) return
  const { id, name } = termToDelete.value
  try {
    await semesterStore.deleteExamFromSemester(route.params.semesterId, id)
    toast.success(`Deleted "${name}".`)
  } catch (err) {
    toast.error(err?.message || 'Failed to delete term.')
  } finally {
    termToDelete.value = null
  }
}

async function handleAddSubject() {
  const name = subjectName.value.trim()
  if (!name) return

  if (!authStore.canAddData) {
    toast.error('Please connect your Google Drive first.')
    return
  }

  isSavingSubject.value = true
  try {
    const id = await semesterStore.addSubject(route.params.semesterId, name)
    if (id) {
      subjectName.value = ''
      toast.success(`Added subject "${name}"`)
    }
  } catch (err) {
    toast.error(err?.message || 'Failed to add subject.')
  } finally {
    isSavingSubject.value = false
  }
}

function handleRenamePrompt(subject) {
  subjectToRename.value = subject
  renameName.value = subject.name
}

async function confirmRenameSubject() {
  if (!subjectToRename.value || !renameName.value.trim()) return
  const oldName = subjectToRename.value.name
  const newName = renameName.value.trim()

  try {
    await semesterStore.renameSubject(subjectToRename.value.id, newName)
    toast.success(`Renamed "${oldName}" to "${newName}"`)
  } catch (err) {
    toast.error(err.message || 'Failed to rename subject')
  } finally {
    subjectToRename.value = null
  }
}

function handleDeletePrompt(subject) {
  subjectToDelete.value = subject
}

async function confirmDeleteSubject() {
  if (!subjectToDelete.value) return
  const name = subjectToDelete.value.name
  try {
    await semesterStore.deleteSubject(subjectToDelete.value.id)
    toast.success(`Deleted "${name}".`)
  } catch (err) {
    toast.error(err?.message || 'Failed to delete subject.')
  } finally {
    subjectToDelete.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl pb-6 sm:pb-10">
    <PageHeader
      :title="semester?.name || 'Semester Details'"
      subtitle="Academic Workspace"
      show-back
      back-to="/"
    >
      <template #actions>
        <div class="flex items-center gap-2">
          <BaseButton variant="primary" size="sm" @click="isAddingTerm = true">
            <Plus class="h-4 w-4" />
            <span>Add Term</span>
          </BaseButton>
          <BaseButton variant="secondary" size="sm" @click="isManagingSubjects = true">
            <Folder class="h-4 w-4" />
            <span>Manage subjects</span>
          </BaseButton>
        </div>
      </template>
    </PageHeader>

    <div v-if="semesterStore.loading" class="flex min-h-48 items-center justify-center" role="status" aria-live="polite">
      <span class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></span>
      <span class="sr-only">Loading semester</span>
    </div>
    <div v-else-if="loadError" class="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-900/50 dark:bg-rose-950/20" role="alert">
      <p class="text-sm font-semibold text-rose-800 dark:text-rose-200">{{ loadError }}</p>
      <BaseButton variant="secondary" size="sm" class="mt-3" @click="loadSemester">Try again</BaseButton>
    </div>

    <div v-else>
    <!-- Terms Section -->
    <section class="mb-6 sm:mb-8">
      <div class="mb-3">
        <div>
          <h2 class="text-base font-bold tracking-tight text-slate-900 dark:text-white sm:text-lg">
            Terms &amp; exams
          </h2>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Choose a term to open its subjects and study materials.
          </p>
        </div>
      </div>

      <div v-if="currentExams.length" class="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <ExamCard
          v-for="examItem in currentExams"
          :key="examItem.id"
          :exam="examItem.id"
          :exam-name="examItem.name"
          :subject-count="subjectList.length"
          :can-delete="true"
          @open="openExam"
          @delete="promptDeleteTerm"
        />
      </div>

      <!-- Clean Empty State if no terms added yet -->
      <div
        v-else
        class="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5 text-center dark:border-indigo-900/40 dark:bg-indigo-950/20 sm:rounded-3xl sm:p-8"
      >
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-400">
          <Calendar class="h-6 w-6" />
        </div>
        <h3 class="mt-3 text-base font-bold text-slate-900 dark:text-white">
          No Terms Added Yet
        </h3>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Add an academic term to organize lecture notes, photos, and handouts.
        </p>
        <div class="mt-4 flex justify-center">
          <BaseButton variant="primary" size="sm" @click="isAddingTerm = true">
            <Plus class="h-4 w-4" />
            <span>Add Term</span>
          </BaseButton>
        </div>
      </div>
    </section>

    <p class="mb-2 text-xs text-slate-500 dark:text-slate-400">
      {{ subjectList.length }} {{ subjectList.length === 1 ? 'subject is' : 'subjects are' }} shared across this semester's terms.
      <button
        type="button"
        class="font-bold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
        @click="isManagingSubjects = true"
      >
        Manage subjects
      </button>
    </p>

    <BottomSheet
      :open="isManagingSubjects"
      title="Manage subjects"
      @close="isManagingSubjects = false; isAddingSubject = false; subjectName = ''"
    >
      <div class="space-y-4">
        <div>
          <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {{ semester?.name }}
          </p>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Subjects are shared across every term in this semester.
          </p>
        </div>

        <form
          v-if="isAddingSubject"
          class="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60"
          @submit.prevent="handleAddSubject"
        >
          <BaseInput
            v-model="subjectName"
            label="Subject name"
            placeholder="e.g. Biology"
            required
            autofocus
          />
          <div class="flex gap-2">
            <BaseButton
              type="button"
              variant="secondary"
              block
              @click="isAddingSubject = false; subjectName = ''"
            >
              Cancel
            </BaseButton>
            <BaseButton
              type="submit"
              variant="primary"
              block
              :loading="isSavingSubject"
              :disabled="!subjectName.trim()"
            >
              Add subject
            </BaseButton>
          </div>
        </form>

        <BaseButton
          v-else
          variant="primary"
          block
          @click="isAddingSubject = true"
        >
          <Plus class="h-4 w-4" />
          Add subject
        </BaseButton>

        <div v-if="subjectList.length" class="space-y-2">
          <SubjectCard
            v-for="sub in subjectList"
            :key="sub.id"
            :subject="sub"
            :interactive="false"
            actions-always-visible
            @rename="handleRenamePrompt"
            @delete="handleDeletePrompt"
          />
        </div>

        <div
          v-else
          class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center dark:border-slate-800"
        >
          <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">No subjects yet</p>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Add subjects here, then open a term to start organizing study materials.
          </p>
        </div>
      </div>
    </BottomSheet>
    </div>

    <!-- Add Term BottomSheet -->
    <BottomSheet
      :open="isAddingTerm"
      title="Add Term to Semester"
      @close="isAddingTerm = false"
    >
      <form @submit.prevent="handleAddTerm()" class="space-y-4">
        <BaseInput
          v-model="newTermName"
          label="Term Name"
          placeholder="e.g. Mid Term, Final Term, Quiz 1, Sessionals"
          required
          autofocus
        />



        <div class="flex gap-3 pt-2">
          <BaseButton
            type="button"
            variant="secondary"
            block
            @click="isAddingTerm = false; newTermName = ''"
          >
            Cancel
          </BaseButton>
          <BaseButton
            type="submit"
            variant="primary"
            block
            :loading="isCreatingTerm"
            :disabled="!newTermName.trim()"
          >
            Add Term
          </BaseButton>
        </div>
      </form>
    </BottomSheet>

    <!-- Delete Term Confirmation Dialog -->
    <ConfirmDialog
      :open="Boolean(termToDelete)"
      title="Delete Term?"
      :message="`Are you sure you want to delete '${termToDelete?.name}'? All notes and files for this term will also be deleted from Google Drive.`"
      confirm-text="Delete Term"
      confirm-variant="danger"
      @confirm="confirmDeleteTerm"
      @cancel="termToDelete = null"
    />

    <!-- Rename Subject BottomSheet -->
    <BottomSheet
      :open="Boolean(subjectToRename)"
      stacked
      title="Rename Subject"
      @close="subjectToRename = null"
    >
      <form @submit.prevent="confirmRenameSubject" class="space-y-4">
        <BaseInput
          v-model="renameName"
          label="Subject Name"
          placeholder="New name"
          required
          autofocus
        />
        <div class="flex gap-3 pt-2">
          <BaseButton
            type="button"
            variant="secondary"
            block
            @click="subjectToRename = null"
          >
            Cancel
          </BaseButton>
          <BaseButton
            type="submit"
            variant="primary"
            block
            :disabled="!renameName.trim()"
          >
            Save
          </BaseButton>
        </div>
      </form>
    </BottomSheet>

    <!-- Delete Subject Confirm -->
    <ConfirmDialog
      :open="Boolean(subjectToDelete)"
      title="Delete Subject?"
      :message="`Are you sure you want to delete '${subjectToDelete?.name}'? All files and notes under this subject will also be deleted from Google Drive.`"
      confirm-text="Delete Subject"
      confirm-variant="danger"
      @confirm="confirmDeleteSubject"
      @cancel="subjectToDelete = null"
    />
  </div>
</template>
