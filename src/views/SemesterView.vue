<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSemesterStore } from '../stores/semesters'
import { useToast } from '../composables/useToast'
import PageHeader from '../components/ui/PageHeader.vue'
import ExamCard from '../components/domain/ExamCard.vue'
import SubjectCard from '../components/domain/SubjectCard.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import ConfirmDialog from '../components/ui/ConfirmDialog.vue'
import BottomSheet from '../components/ui/BottomSheet.vue'
import { Plus, BookOpen, Calendar } from '../components/ui/icons.js'

const route = useRoute()
const router = useRouter()
const semesterStore = useSemesterStore()
const toast = useToast()

const subjectName = ref('')
const isAddingSubject = ref(false)
const subjectToDelete = ref(null)
const subjectToRename = ref(null)
const renameName = ref('')

// Term state (Zero hardcoded terms)
const isAddingTerm = ref(false)
const newTermName = ref('')
const isCreatingTerm = ref(false)
const termToDelete = ref(null)

onMounted(async () => {
  await semesterStore.load()
  if (!semester.value) {
    toast.error('Semester not found')
    router.replace('/')
  }
})

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
    toast.info(`Deleted "${name}" (files deleted from Drive)`)
  } catch (err) {
    toast.error('Failed to delete term')
  } finally {
    termToDelete.value = null
  }
}

async function handleAddSubject() {
  const name = subjectName.value.trim()
  if (!name) return

  try {
    const id = await semesterStore.addSubject(route.params.semesterId, name)
    if (id) {
      subjectName.value = ''
      isAddingSubject.value = false
      toast.success(`Added subject "${name}"`)
    }
  } catch (err) {
    toast.error(err.message || 'Failed to add subject')
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
    toast.info(`Deleted "${name}" (files deleted from Drive)`)
  } catch (err) {
    toast.error('Failed to delete subject')
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
          <BaseButton variant="secondary" size="sm" @click="isAddingSubject = true">
            <Plus class="h-4 w-4" />
            <span>Add Subject</span>
          </BaseButton>
        </div>
      </template>
    </PageHeader>

    <!-- Terms Section -->
    <section class="mb-8">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-xs font-bold uppercase tracking-wider" style="color: var(--color-text-faint)">
            Semester Terms ({{ currentExams.length }})
          </h2>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            Terms like Mid Term, Final Term, or Quizzes
          </p>
        </div>

      </div>

      <div v-if="currentExams.length" class="grid gap-4 sm:grid-cols-2">
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
        class="rounded-3xl border border-dashed border-indigo-200 bg-indigo-50/50 p-6 sm:p-8 text-center dark:border-indigo-900/40 dark:bg-indigo-950/20"
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

    <!-- Subjects Section -->
    <section class="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">
            Semester Subjects ({{ subjectList.length }})
          </h2>
          <p class="text-xs text-slate-400 dark:text-slate-500">
            Subjects studied this semester, shared across all terms
          </p>
        </div>

      </div>

      <!-- Quick Add Input Form -->
      <form
        v-if="isAddingSubject"
        class="mb-4 flex flex-col gap-2.5 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60"
        @submit.prevent="handleAddSubject"
      >
        <BaseInput
          v-model="subjectName"
          label="Subject Name"
          placeholder="e.g. Operating Systems, Data Structures, Calculus"
          required
          autofocus
        />
        <div class="flex justify-end gap-2 pt-1">
          <BaseButton
            type="button"
            variant="ghost"
            size="sm"
            @click="isAddingSubject = false; subjectName = ''"
          >
            Cancel
          </BaseButton>
          <BaseButton
            type="submit"
            variant="primary"
            size="sm"
            :disabled="!subjectName.trim()"
          >
            Save Subject
          </BaseButton>
        </div>
      </form>

      <!-- Subject List -->
      <div v-if="subjectList.length" class="space-y-2">
        <SubjectCard
          v-for="sub in subjectList"
          :key="sub.id"
          :subject="sub"
          @rename="handleRenamePrompt"
          @delete="handleDeletePrompt"
        />
      </div>

      <div
        v-else
        class="rounded-2xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-800"
      >
        <p class="text-xs font-semibold text-slate-500">No subjects added yet.</p>
        <BaseButton variant="primary" size="sm" class="mt-3" @click="isAddingSubject = true">
          <Plus class="h-4 w-4" />
          <span>Add Subject</span>
        </BaseButton>
      </div>
    </section>

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
