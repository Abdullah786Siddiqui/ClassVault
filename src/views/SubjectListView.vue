<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSemesterStore } from '../stores/semesters'
import PageHeader from '../components/ui/PageHeader.vue'
import SubjectCard from '../components/domain/SubjectCard.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import { BookOpen } from '../components/ui/icons.js'

const route = useRoute()
const router = useRouter()
const semesterStore = useSemesterStore()

onMounted(async () => {
  await semesterStore.load()
})

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
  <div class="mx-auto max-w-6xl pb-24 sm:pb-28">
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

    <div v-if="subjects.length" class="space-y-3">
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
