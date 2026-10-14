<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import db from '../../services/db'
import {
  getWhatsAppStatus,
  getWhatsAppGroups,
  getWhatsAppMappings,
  saveWhatsAppMappings,
  logoutWhatsApp,
} from '../../services/whatsapp'
import { useToast } from '../../composables/useToast'
import BottomSheet from '../ui/BottomSheet.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close'])
const toast = useToast()

const activeTab = ref('connection') // 'connection' | 'mappings'
const botLoading = ref(false)
const botStatus = ref({
  status: 'offline', // 'offline' | 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
  qr: null,
  user: null,
  hasDrive: false,
})
const waGroups = ref([])
const mappings = ref([])
const isSaving = ref(false)
const isLoggingOut = ref(false)
const copiedCommand = ref(false)

// Local database state for destination dropdowns
const semesters = ref([])
const subjects = ref([])

// New mapping form state
const selectedGroupOption = ref('') // 'jid' or '__custom__'
const customGroupName = ref('')
const selectedSemesterId = ref('')
const selectedExam = ref('Midterm')
const selectedSubjectId = ref('')

let pollTimer = null

const isConnected = computed(() => botStatus.value.status === 'connected')
const isQrReady = computed(() => botStatus.value.status === 'qr_ready' && Boolean(botStatus.value.qr))
const isOffline = computed(() => botStatus.value.status === 'offline')

const filteredSubjects = computed(() => {
  if (!selectedSemesterId.value) return subjects.value
  return subjects.value.filter((s) => s.semesterId === Number(selectedSemesterId.value))
})

const selectedSemesterName = computed(() => {
  const sem = semesters.value.find((s) => s.id === Number(selectedSemesterId.value))
  return sem ? sem.name : ''
})

const selectedSubjectName = computed(() => {
  const sub = subjects.value.find((s) => s.id === Number(selectedSubjectId.value))
  return sub ? sub.name : ''
})

async function loadLocalDatabaseData() {
  try {
    semesters.value = await db.semesters.toArray()
    subjects.value = await db.subjects.toArray()

    if (semesters.value.length > 0 && !selectedSemesterId.value) {
      selectedSemesterId.value = String(semesters.value[0].id)
    }
    if (filteredSubjects.value.length > 0 && !selectedSubjectId.value) {
      selectedSubjectId.value = String(filteredSubjects.value[0].id)
    }
  } catch (err) {
    console.error('Error loading semesters/subjects:', err)
  }
}

async function refreshBotData() {
  const statusRes = await getWhatsAppStatus()
  botStatus.value = statusRes

  if (statusRes.status === 'connected') {
    // WhatsApp is connected! Fetch groups and mappings
    const [groupsRes, mappingsRes] = await Promise.all([
      getWhatsAppGroups(),
      getWhatsAppMappings(),
    ])

    if (groupsRes?.ok && Array.isArray(groupsRes.groups)) {
      waGroups.value = groupsRes.groups
      if (groupsRes.groups.length > 0 && !selectedGroupOption.value) {
        selectedGroupOption.value = groupsRes.groups[0].id
      }
    }

    if (mappingsRes?.ok && Array.isArray(mappingsRes.mappings)) {
      mappings.value = mappingsRes.mappings
    }
  } else if (statusRes.status !== 'offline') {
    // If bot server is up, load mappings even before WhatsApp is linked
    const mappingsRes = await getWhatsAppMappings()
    if (mappingsRes?.ok && Array.isArray(mappingsRes.mappings)) {
      mappings.value = mappingsRes.mappings
    }
  }
}

function startPolling() {
  stopPolling()
  refreshBotData()
  // Poll every 3 seconds to auto-detect QR scan or connection
  pollTimer = setInterval(async () => {
    if (!props.open) return
    await refreshBotData()
  }, 3000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await loadLocalDatabaseData()
      startPolling()
    } else {
      stopPolling()
    }
  },
)

watch(selectedSemesterId, () => {
  // Reset subject selection to first available subject in this semester
  if (filteredSubjects.value.length > 0) {
    selectedSubjectId.value = String(filteredSubjects.value[0].id)
  } else {
    selectedSubjectId.value = ''
  }
})

function copyRunCommand() {
  const cmd = 'npm start --prefix whatsapp-bot'
  navigator.clipboard.writeText(cmd)
  copiedCommand.value = true
  toast.success('Command copied to clipboard!')
  setTimeout(() => {
    copiedCommand.value = false
  }, 2500)
}

function addMapping() {
  let targetGroupName = ''
  let targetGroupId = ''

  if (selectedGroupOption.value === '__custom__') {
    if (!customGroupName.value.trim()) {
      toast.error('Please enter a WhatsApp group name')
      return
    }
    targetGroupName = customGroupName.value.trim()
  } else {
    const foundGroup = waGroups.value.find((g) => g.id === selectedGroupOption.value)
    if (!foundGroup) {
      toast.error('Please select a WhatsApp group')
      return
    }
    targetGroupName = foundGroup.name
    targetGroupId = foundGroup.id
  }

  if (!selectedSemesterName.value) {
    toast.error('Please select a semester')
    return
  }
  if (!selectedSubjectName.value) {
    toast.error('Please select a subject')
    return
  }

  // Check if mapping already exists
  const existingIdx = mappings.value.findIndex(
    (m) =>
      (targetGroupId && m.groupId === targetGroupId) ||
      m.groupName.toLowerCase() === targetGroupName.toLowerCase(),
  )

  const newMapping = {
    groupId: targetGroupId || undefined,
    groupName: targetGroupName,
    semester: selectedSemesterName.value,
    exam: selectedExam.value || 'Midterm',
    subject: selectedSubjectName.value,
  }

  if (existingIdx !== -1) {
    mappings.value[existingIdx] = newMapping
    toast.info(`Updated mapping for "${targetGroupName}"`)
  } else {
    mappings.value.push(newMapping)
    toast.success(`Linked "${targetGroupName}" to "${selectedSubjectName.value}"`)
  }

  // Reset custom input
  customGroupName.value = ''
}

function removeMapping(index) {
  const removed = mappings.value.splice(index, 1)
  if (removed.length > 0) {
    toast.info(`Removed mapping for "${removed[0].groupName}"`)
  }
}

async function handleSaveMappings() {
  isSaving.value = true
  try {
    const res = await saveWhatsAppMappings(mappings.value)
    if (res?.ok) {
      toast.success('WhatsApp group mappings saved successfully!')
    } else {
      toast.error(res?.error || 'Could not save mappings')
    }
  } catch (err) {
    toast.error(err.message || 'Error saving mappings')
  } finally {
    isSaving.value = false
  }
}

async function handleLogout() {
  if (!confirm('Are you sure you want to disconnect WhatsApp? You will need to scan QR again.')) {
    return
  }
  isLoggingOut.value = true
  try {
    await logoutWhatsApp()
    toast.info('Disconnected WhatsApp')
    await refreshBotData()
  } catch (err) {
    toast.error(err.message || 'Could not disconnect')
  } finally {
    isLoggingOut.value = false
  }
}

onMounted(() => {
  if (props.open) {
    loadLocalDatabaseData()
    startPolling()
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <BottomSheet :open="open" title="WhatsApp Vault Sync" @close="emit('close')">
    <div class="space-y-5 pb-6">
      <!-- Tabs Switcher -->
      <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150"
          :class="
            activeTab === 'connection'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          "
          @click="activeTab = 'connection'"
        >
          <i class="fa-brands fa-whatsapp text-base"></i>
          <span>WhatsApp Status</span>
          <span
            v-if="isConnected"
            class="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"
          ></span>
        </button>

        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150"
          :class="
            activeTab === 'mappings'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          "
          @click="activeTab = 'mappings'"
        >
          <i class="fa-solid fa-arrows-split-up-and-left text-sm"></i>
          <span>Group Mappings</span>
          <span
            v-if="mappings.length > 0"
            class="px-1.5 py-0.2 rounded-full text-xs font-bold"
            :class="activeTab === 'mappings' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
          >
            {{ mappings.length }}
          </span>
        </button>
      </div>

      <!-- ==================================================== -->
      <!-- TAB 1: WhatsApp Connection & In-App QR Code Scanning -->
      <!-- ==================================================== -->
      <div v-if="activeTab === 'connection'" class="space-y-4">
        <!-- 1. Bot Offline Banner -->
        <div
          v-if="isOffline"
          class="p-4 rounded-xl border border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 space-y-3"
        >
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
              <i class="fa-solid fa-server"></i>
            </div>
            <div class="flex-1">
              <h4 class="font-bold text-sm">WhatsApp Bridge Service is Offline</h4>
              <p class="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                Run the background bridge service on your computer so WhatsApp photos and files can automatically sync into ClassVault.
              </p>
            </div>
          </div>

          <div class="bg-slate-900 text-slate-100 p-2.5 rounded-lg font-mono text-xs flex items-center justify-between">
            <span>npm start --prefix whatsapp-bot</span>
            <button
              type="button"
              class="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-xs transition-colors flex items-center gap-1.5"
              @click="copyRunCommand"
            >
              <i class="fa-solid fa-copy"></i>
              <span>{{ copiedCommand ? 'Copied!' : 'Copy' }}</span>
            </button>
          </div>

          <div class="flex justify-end pt-1">
            <BaseButton size="xs" variant="primary" @click="refreshBotData">
              <i class="fa-solid fa-rotate-right mr-1.5"></i> Check Connection Again
            </BaseButton>
          </div>
        </div>

        <!-- 2. QR Code Ready Screen (IN-APP SCANNING) -->
        <div
          v-else-if="isQrReady"
          class="p-5 rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-transparent text-center space-y-4"
        >
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-xs animate-pulse">
            <i class="fa-solid fa-qrcode"></i> Scan QR Code with WhatsApp
          </div>

          <!-- Clean QR Code Rendered Directly In App -->
          <div class="relative w-64 h-64 mx-auto p-3 bg-white rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center">
            <img
              :src="botStatus.qr"
              alt="Scan this WhatsApp QR Code"
              class="w-full h-full object-contain rounded-lg"
            />
          </div>

          <!-- Scan instructions -->
          <div class="max-w-xs mx-auto text-left space-y-2 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
            <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <i class="fa-solid fa-mobile-screen-button text-emerald-500"></i>
              <span>Scan with WhatsApp on your phone:</span>
            </div>
            <ol class="list-decimal list-inside space-y-1 pl-1 text-[11px] leading-relaxed">
              <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
              <li>Tap <strong>Settings</strong> (or tap the 3 dots menu)</li>
              <li>Select <strong>Linked Devices</strong> &rarr; <strong>Link a Device</strong></li>
              <li>Point your phone camera at this <strong>QR Code</strong></li>
            </ol>
          </div>

          <div class="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-spinner fa-spin text-emerald-500"></i>
            <span>Waiting for connection... (Auto-refreshes)</span>
          </div>
        </div>

        <!-- 3. Connected Screen -->
        <div
          v-else-if="isConnected"
          class="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-slate-800 dark:text-slate-100 space-y-4"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg shadow-md shadow-emerald-600/30">
                <i class="fa-solid fa-check"></i>
              </div>
              <div>
                <h4 class="font-bold text-base text-emerald-950 dark:text-emerald-100 flex items-center gap-2">
                  <span>WhatsApp Connected!</span>
                  <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                </h4>
                <p class="text-xs text-emerald-800 dark:text-emerald-300 font-mono">
                  {{ botStatus.user?.name || botStatus.user?.id || 'Connected Account' }}
                </p>
              </div>
            </div>

            <button
              type="button"
              class="px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg font-medium transition-colors"
              :disabled="isLoggingOut"
              @click="handleLogout"
            >
              <i class="fa-solid fa-arrow-right-from-bracket mr-1"></i>
              <span>{{ isLoggingOut ? 'Disconnecting...' : 'Disconnect' }}</span>
            </button>
          </div>

          <div class="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-emerald-500/20 text-xs space-y-1.5">
            <div class="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              <i class="fa-solid fa-circle-check text-emerald-500"></i>
              <span>Active WhatsApp Groups: <strong>{{ waGroups.length }}</strong></span>
            </div>
            <div class="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              <i class="fa-solid fa-circle-check text-emerald-500"></i>
              <span>Mapped Subjects: <strong>{{ mappings.length }}</strong></span>
            </div>
            <div class="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              <i class="fa-solid fa-cloud-arrow-up text-emerald-500"></i>
              <span>Google Drive Auto-Upload: <strong>{{ botStatus.hasDrive ? 'Enabled ✓' : 'Local Only (Run npm run auth-drive)' }}</strong></span>
            </div>
          </div>

          <div class="pt-1">
            <BaseButton
              variant="primary"
              size="sm"
              class="w-full bg-emerald-600 hover:bg-emerald-700"
              @click="activeTab = 'mappings'"
            >
              <i class="fa-solid fa-sliders mr-1.5"></i> Manage Group to Subject Mappings
            </BaseButton>
          </div>
        </div>

        <!-- 4. Connecting / Initializing -->
        <div v-else class="text-center py-12 space-y-3">
          <i class="fa-solid fa-circle-notch fa-spin text-3xl text-emerald-500"></i>
          <p class="text-sm font-medium text-slate-600 dark:text-slate-400">
            Checking WhatsApp connection...
          </p>
        </div>
      </div>

      <!-- ==================================================== -->
      <!-- TAB 2: Group to Subject Mappings                     -->
      <!-- ==================================================== -->
      <div v-else class="space-y-5">
        <!-- Helpful explanation banner -->
        <div class="p-3 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
          <i class="fa-solid fa-circle-info text-blue-500 mt-0.5 shrink-0"></i>
          <p class="leading-relaxed">
            <strong>Group and Subject names do not need to match!</strong> Select any WhatsApp group below and link it to the exact ClassVault Semester, Exam, and Subject you want incoming notes and files saved into.
          </p>
        </div>

        <!-- Add Mapping Form Card -->
        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3.5">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Add New Connection
          </h4>

          <!-- Group Selector -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">
              1. Select WhatsApp Group:
            </label>

            <select
              v-if="waGroups.length > 0"
              v-model="selectedGroupOption"
              class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option v-for="g in waGroups" :key="g.id" :value="g.id">
                {{ g.name }} ({{ g.participantsCount }} members)
              </option>
              <option value="__custom__">+ Enter custom group name manually...</option>
            </select>

            <div v-if="waGroups.length === 0 || selectedGroupOption === '__custom__'" class="mt-1.5">
              <input
                v-model="customGroupName"
                type="text"
                placeholder="e.g. BSCS Fall 2024 Calculus Group"
                class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <!-- ClassVault Destination Dropdowns -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">
              2. ClassVault Destination:
            </label>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <!-- Semester Dropdown -->
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Semester</span>
                <select
                  v-model="selectedSemesterId"
                  class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option v-for="sem in semesters" :key="sem.id" :value="String(sem.id)">
                    {{ sem.name }}
                  </option>
                </select>
              </div>

              <!-- Exam Dropdown -->
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Exam</span>
                <select
                  v-model="selectedExam"
                  class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Midterm">Midterm</option>
                  <option value="Final">Final</option>
                </select>
              </div>

              <!-- Subject Dropdown -->
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Subject</span>
                <select
                  v-model="selectedSubjectId"
                  class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option v-for="sub in filteredSubjects" :key="sub.id" :value="String(sub.id)">
                    {{ sub.name }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div class="pt-1 flex justify-end">
            <BaseButton
              size="sm"
              variant="primary"
              class="bg-emerald-600 hover:bg-emerald-700"
              @click="addMapping"
            >
              <i class="fa-solid fa-plus mr-1.5"></i> Link Group to Subject
            </BaseButton>
          </div>
        </div>

        <!-- Active Mappings List -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Mappings ({{ mappings.length }})
            </h4>
            <span class="text-[11px] text-slate-400">
              Auto-saves to Google Drive & Device
            </span>
          </div>

          <div v-if="mappings.length === 0" class="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl">
            No group mappings configured yet. Use the form above to connect your first group!
          </div>

          <div v-else class="space-y-2 max-h-64 overflow-y-auto pr-1">
            <div
              v-for="(m, idx) in mappings"
              :key="idx"
              class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shadow-sm hover:border-emerald-500/40 transition-colors"
            >
              <div class="flex-1 min-w-0 space-y-1">
                <!-- Group Name -->
                <div class="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  <i class="fa-brands fa-whatsapp text-emerald-500 text-sm"></i>
                  <span class="truncate">{{ m.groupName }}</span>
                </div>

                <!-- Destination Details -->
                <div class="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <i class="fa-solid fa-arrow-turn-down-right text-emerald-500/70 text-[10px]"></i>
                  <span class="font-medium text-emerald-600 dark:text-emerald-400">{{ m.semester }}</span>
                  <span>&bull;</span>
                  <span>{{ m.exam }}</span>
                  <span>&bull;</span>
                  <span class="font-semibold text-slate-700 dark:text-slate-300">{{ m.subject }}</span>
                </div>
              </div>

              <!-- Delete Button -->
              <button
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-500/10 flex items-center justify-center transition-colors"
                title="Remove this mapping"
                @click="removeMapping(idx)"
              >
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="pt-2">
          <BaseButton
            variant="primary"
            class="w-full bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
            :disabled="isSaving"
            @click="handleSaveMappings"
          >
            <i class="fa-solid fa-floppy-disk mr-2"></i>
            <span>{{ isSaving ? 'Saving Mappings...' : 'Save All Mappings' }}</span>
          </BaseButton>
        </div>
      </div>
    </div>
  </BottomSheet>
</template>
