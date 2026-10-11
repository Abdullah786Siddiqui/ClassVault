<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import BaseCard from '../ui/BaseCard.vue'
import SyncStatusBadge from './SyncStatusBadge.vue'
import IconButton from '../ui/IconButton.vue'
import { formatDate } from '../../utils/format'
import { Camera, FileText, Star, UploadCloud } from '../ui/icons.js'

const props = defineProps({
  item: { type: Object, required: true },
  semesterName: { type: String, default: '' },
  subjectName: { type: String, default: '' },
  examName: { type: String, default: '' },
})

const emit = defineEmits(['star'])
const router = useRouter()

const typeIcon = computed(() => {
  if (props.item.type === 'photo') return Camera
  if (props.item.type === 'file') return UploadCloud
  return FileText
})

const preview = computed(() => {
  if (props.item.type === 'text') return props.item.text
  return props.item.caption || props.item.fileName || props.item.title
})

function openItem() {
  router.push(`/semester/${props.item.semesterId}/${props.item.exam}/subject/${props.item.subjectId}`)
}
</script>

<template>
  <BaseCard hoverable class="item-result-row flex items-start gap-3 p-3 sm:p-4" @click="openItem">
    <div class="cv-icon-tile shrink-0">
      <component :is="typeIcon" class="h-4 w-4" />
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="truncate text-sm font-bold" style="color: var(--color-text)">
            {{ item.title || item.fileName || 'Untitled' }}
          </h3>
          <p class="mt-0.5 truncate text-xs" style="color: var(--color-text-faint)">
            {{ [semesterName, examName, subjectName].filter(Boolean).join(' · ') }}
            <span v-if="item.createdAt"> · {{ formatDate(item.createdAt) }}</span>
          </p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <SyncStatusBadge :status="item.syncStatus" />
          <IconButton
            :icon="Star"
            :aria-label="item.starred ? 'Remove star' : 'Star item'"
            :pressed="Boolean(item.starred)"
            variant="ghost"
            size="sm"
            @click.stop="emit('star', item)"
          />
        </div>
      </div>
      <p class="mt-1.5 line-clamp-2 text-xs sm:mt-2 sm:text-sm" style="color: var(--color-text-muted)">
        {{ preview }}
      </p>
    </div>
  </BaseCard>
</template>
