<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSemesterStore } from '../stores/semesters'
import PageHeader from '../components/ui/PageHeader.vue'
import SubjectCard from '../components/domain/SubjectCard.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import { BookOpen } from '../components/ui/icons.js'

const route = useRoute()
const router = useRouter()
const semesterStore = useSemesterStore()
const isLoading = ref(true)
const loadError = ref('')

async function loadSemester() {
  isLoading.value = true
  loadError.value = ''
  try {
    await semesterStore.load()
    if (!semester.value) {
      loadError.value = 'Semester not found.'
    }
  } catch (error) {
    loadError.value = error?.message || 'Could not load this semester.'
  } finally {
    isLoading.value = false
  }
}

watch(() => route.params.semesterId, loadSemester, { immediate: true })

const semester = computed(() =>
  semesterStore.semesters.find((item) => item.id === Number(route.params.semesterId)),
)

const subjects = computed(() =>
  semesterStore.getSubjectsForSemester(route.params.semesterId),
)

const examType = computed(() => route.params.exam)
const examLabel = computed(() => {
  const match = semester.value?.exams?.find((e) => e.id === examType.value)
  if (match) return match.name
  if (examType.value === 'mid') return 'Mid Term'
  if (examType.value === 'final') return 'Final Term'
  return examType.value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
})

function openSubject(subjectId) {
  router.push(`/semester/${route.params.semesterId}/${route.params.exam}/subject/${subjectId}`)
}
</script>

<template>
  <div class="mx-auto max-w-6xl pb-6 sm:pb-10">
    <PageHeader
      :title="`${examLabel} Subjects`"
      show-back
      :back-to="`/semester/${route.params.semesterId}`"
    >
      <template #subtitle>
        <div class="flex items-center gap-2">
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

    <div v-if="isLoading" class="flex min-h-48 items-center justify-center" role="status" aria-live="polite">
      <span class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></span>
      <span class="sr-only">Loading subjects</span>
    </div>

    <div v-else-if="loadError" class="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-900/50 dark:bg-rose-950/20" role="alert">
      <p class="text-sm font-semibold text-rose-800 dark:text-rose-200">{{ loadError }}</p>
      <button
        type="button"
        class="mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
        @click="loadSemester"
      >
        Try again
      </button>
    </div>

    <div v-else-if="subjects.length" class="space-y-3">
      <SubjectCard
        v-for="subject in subjects"
        :key="subject.id"
        :subject="subject"
        :show-actions="false"
        @open="openSubject"
      />
    </div>

    <EmptyState
      v-else
      :icon="BookOpen"
      title="No subjects in this semester"
      description="Add subjects in the semester overview screen to start recording lecture notes."
      action-label="Go to semester overview"
      @action="router.push(`/semester/${route.params.semesterId}`)"
    />
  </div>
</template>
