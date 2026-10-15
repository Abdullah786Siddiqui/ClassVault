<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getWhatsAppStatus, getWhatsAppGroups, saveWhatsAppMappings, getWhatsAppMappings } from '../../services/whatsapp'
import { useToast } from '../../composables/useToast'
import BottomSheet from '../ui/BottomSheet.vue'
import BaseButton from '../ui/BaseButton.vue'
import SearchableSelect from '../ui/SearchableSelect.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  semesterId: { type: [String, Number], default: '' },
  subjectId: { type: [String, Number], default: '' },
  exam: { type: String, default: '' },
  semesterName: { type: String, default: '' },
  subjectName: { type: String, default: '' },
})

const emit = defineEmits(['close'])
const toast = useToast()

/* ── State ───────────────────────────────────────── */
const botStatus = ref({ status: 'connecting', qr: null, user: null })
const groups = ref([])
const selectedGroupId = ref('')
const selectedGroupName = ref('')
const allowImages = ref(true)
const allowFiles = ref(true)
const allowText = ref(false)
const isSaving = ref(false)
const isInitialLoading = ref(true)
const existingMapping = ref(null)

let pollTimer = null

/* ── Computed ────────────────────────────────────── */
const isConnected = computed(() => botStatus.value.status === 'connected')
const isQrReady = computed(() => botStatus.value.status === 'qr_ready' && Boolean(botStatus.value.qr))
const isOffline = computed(() => botStatus.value.status === 'offline' || botStatus.value.status === 'disconnected')

/* ── Fetch WhatsApp Data ─────────────────────────── */
async function loadData() {
  try {
    const st = await getWhatsAppStatus()
    botStatus.value = st || { status: 'offline' }

    if (botStatus.value.status === 'connected') {
      const gRes = await getWhatsAppGroups()
      if (gRes?.ok && Array.isArray(gRes.groups)) {
        groups.value = gRes.groups
      }

      // Check existing mapping for this subject
      const mRes = await getWhatsAppMappings()
      if (mRes?.ok && Array.isArray(mRes.mappings)) {
        const match = mRes.mappings.find(
          m => Number(m.subjectId) === Number(props.subjectId) || m.subject === props.subjectName
        )
        if (match) {
          existingMapping.value = match
          selectedGroupId.value = match.groupId || ''
          selectedGroupName.value = match.groupName || ''
          allowImages.value = match.allowImages !== false
          allowFiles.value = match.allowFiles !== false
          allowText.value = match.allowText === true
        }
      }
    }
  } catch {
    botStatus.value = { status: 'offline' }
  } finally {
    isInitialLoading.value = false
  }
}

/* ── Polling & Lifecycle ─────────────────────────── */
function startPolling() {
  isInitialLoading.value = true
  loadData()
  // Poll periodically while open to catch QR scans or state updates
  pollTimer = setInterval(loadData, 3000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    selectedGroupId.value = ''
    selectedGroupName.value = ''
    existingMapping.value = null
    startPolling()
  } else {
    stopPolling()
  }
})

onMounted(() => {
  if (props.open) startPolling()
})

onUnmounted(stopPolling)

/* ── Group Selection ─────────────────────────────── */
function handleGroupSelect(group) {
  selectedGroupId.value = group.id || group.value
  selectedGroupName.value = group.name || group.label
}

/* ── Save Mapping ────────────────────────────────── */
async function handleSave() {
  if (!selectedGroupId.value) {
    toast.error('Please select a WhatsApp group first')
    return
  }

  isSaving.value = true
  try {
    const mRes = await getWhatsAppMappings()
    let allMappings = mRes?.mappings || []

    // Remove any existing entry for this subject
    allMappings = allMappings.filter(
      m => Number(m.subjectId) !== Number(props.subjectId) && m.subject !== props.subjectName
    )

    allMappings.push({
      groupId: selectedGroupId.value,
      groupName: selectedGroupName.value,
      subjectId: Number(props.subjectId),
      semesterId: Number(props.semesterId),
      semester: props.semesterName,
      exam: props.exam,
      subject: props.subjectName,
      allowImages: allowImages.value,
      allowFiles: allowFiles.value,
      allowText: allowText.value,
    })

    const res = await saveWhatsAppMappings(allMappings)
    if (res?.ok) {
      toast.success(`Connected "${selectedGroupName.value}" to ${props.subjectName}!`)
      existingMapping.value = allMappings[allMappings.length - 1]
      emit('close')
    } else {
      toast.error(res?.error || 'Failed to save mapping.')
    }
  } catch (err) {
    toast.error(err.message || 'Error saving mapping')
  } finally {
    isSaving.value = false
  }
}

/* ── Remove Link ─────────────────────────────────── */
async function handleRemove() {
  isSaving.value = true
  try {
    const mRes = await getWhatsAppMappings()
    const updated = (mRes?.mappings || []).filter(
      m => Number(m.subjectId) !== Number(props.subjectId) && m.subject !== props.subjectName
    )
    const res = await saveWhatsAppMappings(updated)
    if (res?.ok) {
      toast.info(`Disconnected WhatsApp group from ${props.subjectName}`)
      existingMapping.value = null
      selectedGroupId.value = ''
      selectedGroupName.value = ''
    }
  } catch (err) {
    toast.error(err.message)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <BottomSheet :open="open" title="Link to WhatsApp" @close="emit('close')">
    <div class="space-y-5 pb-5">

      <!-- Subject Target Header Badge -->
      <div class="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
          <i class="fa-solid fa-graduation-cap text-lg"></i>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Target Subject
          </p>
          <p class="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
            {{ subjectName }} <span class="text-xs font-normal text-slate-400">&mdash; {{ semesterName }} ({{ exam }})</span>
          </p>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════ -->
      <!-- 1. INITIAL CONNECTING / LOADING STATE          -->
      <!-- ══════════════════════════════════════════════ -->
      <div v-if="isInitialLoading" class="py-12 flex flex-col items-center justify-center gap-3 text-center">
        <div class="relative flex items-center justify-center">
          <div class="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-2xl animate-pulse">
            <i class="fa-brands fa-whatsapp"></i>
          </div>
          <span class="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
          </span>
        </div>
        <div>
          <p class="font-bold text-sm text-slate-800 dark:text-slate-200">Connecting to WhatsApp...</p>
          <p class="text-xs text-slate-400 mt-0.5">Checking linked device and group list</p>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════ -->
      <!-- 2. CONNECTED STATE (Dropdown + Checkboxes)     -->
      <!-- ══════════════════════════════════════════════ -->
      <div v-else-if="isConnected" class="space-y-5">
        
        <!-- Existing Connected Group Notification -->
        <div 
          v-if="existingMapping" 
          class="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300/40"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <i class="fa-solid fa-link text-emerald-500 text-sm shrink-0"></i>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wide block">
                Currently Linked
              </span>
              <span class="font-semibold text-xs text-emerald-900 dark:text-emerald-200 truncate block">
                {{ existingMapping.groupName }}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
            :disabled="isSaving"
            @click="handleRemove"
          >
            Disconnect
          </button>
        </div>

        <!-- Group Selector via SearchableSelect -->
        <div class="space-y-1.5">
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Select WhatsApp Group
          </label>
          <SearchableSelect
            v-model="selectedGroupId"
            :options="groups"
            placeholder="Search and choose a group..."
            search-placeholder="Type group name to search..."
            :loading="isInitialLoading"
            @select="handleGroupSelect"
          />
        </div>

        <!-- 3 Content Types to Auto-Save -->
        <div class="space-y-2">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Auto-Save to this Subject:
          </p>

          <div class="grid grid-cols-3 gap-2.5">
            <!-- 1. Images -->
            <label
              class="flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer select-none transition-all duration-150"
              :class="allowImages
                ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-400 text-sky-800 dark:text-sky-200 ring-1 ring-sky-400/30'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 hover:border-slate-300'"
            >
              <div 
                class="w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-colors"
                :class="allowImages ? 'bg-sky-500 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'"
              >
                <i class="fa-solid fa-image"></i>
              </div>
              <span class="text-xs font-bold">Images</span>
              <input type="checkbox" v-model="allowImages" class="sr-only" />
              <div 
                class="w-4 h-4 rounded-md border flex items-center justify-center transition-all"
                :class="allowImages ? 'bg-sky-500 border-sky-500 text-white' : 'border-slate-300 dark:border-slate-600'"
              >
                <i v-if="allowImages" class="fa-solid fa-check text-[9px]"></i>
              </div>
            </label>

            <!-- 2. Files / PDFs -->
            <label
              class="flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer select-none transition-all duration-150"
              :class="allowFiles
                ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-400 text-violet-800 dark:text-violet-200 ring-1 ring-violet-400/30'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 hover:border-slate-300'"
            >
              <div 
                class="w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-colors"
                :class="allowFiles ? 'bg-violet-500 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'"
              >
                <i class="fa-solid fa-file-lines"></i>
              </div>
              <span class="text-xs font-bold">Files / PDF</span>
              <input type="checkbox" v-model="allowFiles" class="sr-only" />
              <div 
                class="w-4 h-4 rounded-md border flex items-center justify-center transition-all"
                :class="allowFiles ? 'bg-violet-500 border-violet-500 text-white' : 'border-slate-300 dark:border-slate-600'"
              >
                <i v-if="allowFiles" class="fa-solid fa-check text-[9px]"></i>
              </div>
            </label>

            <!-- 3. Text Messages -->
            <label
              class="flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer select-none transition-all duration-150"
              :class="allowText
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 text-amber-800 dark:text-amber-200 ring-1 ring-amber-400/30'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 hover:border-slate-300'"
            >
              <div 
                class="w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-colors"
                :class="allowText ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'"
              >
                <i class="fa-solid fa-comment-dots"></i>
              </div>
              <span class="text-xs font-bold">Text Msgs</span>
              <input type="checkbox" v-model="allowText" class="sr-only" />
              <div 
                class="w-4 h-4 rounded-md border flex items-center justify-center transition-all"
                :class="allowText ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 dark:border-slate-600'"
              >
                <i v-if="allowText" class="fa-solid fa-check text-[9px]"></i>
              </div>
            </label>
          </div>

          <p class="text-[11px] text-slate-400 leading-normal pt-1">
            <i class="fa-solid fa-circle-info text-emerald-500 mr-1"></i>
            Whenever selected media is posted in the group, ClassVault will automatically save it under 
            <strong class="text-slate-700 dark:text-slate-300">{{ subjectName }}</strong>.
          </p>
        </div>

        <!-- Action Link Button -->
        <BaseButton
          variant="primary"
          class="w-full bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 py-3 rounded-xl"
          :disabled="!selectedGroupId || isSaving"
          @click="handleSave"
        >
          <i class="fa-brands fa-whatsapp text-lg mr-2"></i>
          <span v-if="isSaving">Connecting...</span>
          <span v-else-if="selectedGroupName">Link "{{ selectedGroupName }}" to {{ subjectName }}</span>
          <span v-else>Select a group to link</span>
        </BaseButton>
      </div>

      <!-- ══════════════════════════════════════════════ -->
      <!-- 3. QR READY STATE (Device Pairing)             -->
      <!-- ══════════════════════════════════════════════ -->
      <div v-else-if="isQrReady" class="text-center space-y-4 py-2">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-xs animate-pulse">
          <i class="fa-solid fa-qrcode"></i> Scan to connect WhatsApp
        </div>

        <div class="w-64 h-64 mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 flex items-center justify-center p-3">
          <img :src="botStatus.qr" alt="WhatsApp QR Code" class="w-full h-full object-contain rounded-xl" />
        </div>

        <div class="text-left bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs text-slate-600 dark:text-slate-400 space-y-2 max-w-sm mx-auto">
          <p class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
            <i class="fa-solid fa-mobile-screen-button text-emerald-500"></i> How to connect:
          </p>
          <ol class="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
            <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
            <li>Tap <strong>Settings</strong> (or 3 dots menu) &rarr; <strong>Linked Devices</strong></li>
            <li>Tap <strong>Link a Device</strong> and point camera here</li>
          </ol>
        </div>

        <p class="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <i class="fa-solid fa-circle-notch fa-spin text-emerald-500"></i>
          Waiting for scan... this will update automatically!
        </p>
      </div>

      <!-- ══════════════════════════════════════════════ -->
      <!-- 4. OFFLINE / INITIALIZING STATE (Friendly)     -->
      <!-- ══════════════════════════════════════════════ -->
      <div v-else class="text-center py-8 space-y-4">
        <div class="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto text-2xl">
          <i class="fa-solid fa-plug-circle-exclamation"></i>
        </div>
        <div>
          <h4 class="font-bold text-sm text-slate-800 dark:text-slate-200">
            Connecting to WhatsApp Bridge...
          </h4>
          <p class="text-xs text-slate-400 max-w-xs mx-auto mt-1">
            Setting up background sync service. Please wait a moment.
          </p>
        </div>

        <div class="pt-2">
          <BaseButton size="sm" variant="secondary" @click="loadData">
            <i class="fa-solid fa-rotate-right mr-1.5"></i> Refresh Connection
          </BaseButton>
        </div>
      </div>

    </div>
  </BottomSheet>
</template>
