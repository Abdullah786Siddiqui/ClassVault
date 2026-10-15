<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getWhatsAppStatus, getWhatsAppGroups, saveWhatsAppMappings, getWhatsAppMappings } from '../../services/whatsapp'
import { useToast } from '../../composables/useToast'
import BottomSheet from '../ui/BottomSheet.vue'
import BaseButton from '../ui/BaseButton.vue'

const props = defineProps({
  open:       { type: Boolean, default: false },
  // Subject details — pre-filled so user just picks a group
  semesterId: { type: [String, Number], default: '' },
  subjectId:  { type: [String, Number], default: '' },
  exam:       { type: String, default: '' },
  semesterName: { type: String, default: '' },
  subjectName:  { type: String, default: '' },
})

const emit  = defineEmits(['close'])
const toast = useToast()

/* ── state ─────────────────────────────────────── */
const botStatus  = ref({ status: 'offline', qr: null, user: null })
const groups     = ref([])
const selectedGroupId   = ref('')
const selectedGroupName = ref('')
const allowImages = ref(true)
const allowFiles  = ref(true)
const allowText   = ref(false)
const isSaving    = ref(false)
const isLoading   = ref(false)
const existingMapping = ref(null)   // current saved mapping for this subject (if any)

let pollTimer = null

/* ── computed ───────────────────────────────────── */
const isConnected = computed(() => botStatus.value.status === 'connected')
const isQrReady   = computed(() => botStatus.value.status === 'qr_ready' && Boolean(botStatus.value.qr))
const isOffline   = computed(() => botStatus.value.status === 'offline')

const selectedGroup = computed(() =>
  groups.value.find(g => g.id === selectedGroupId.value) || null
)

/* ── fetch bot data ─────────────────────────────── */
async function fetchAll() {
  isLoading.value = true
  try {
    const st = await getWhatsAppStatus()
    botStatus.value = st || { status: 'offline' }

    if (botStatus.value.status === 'connected') {
      const gRes = await getWhatsAppGroups()
      if (gRes?.ok) groups.value = gRes.groups || []

      // Load existing mapping for this subject
      const mRes = await getWhatsAppMappings()
      if (mRes?.ok) {
        const match = (mRes.mappings || []).find(
          m => m.subjectId === Number(props.subjectId) || m.subject === props.subjectName
        )
        if (match) {
          existingMapping.value = match
          selectedGroupId.value   = match.groupId   || ''
          selectedGroupName.value = match.groupName || ''
          allowImages.value = match.allowImages !== false
          allowFiles.value  = match.allowFiles  !== false
          allowText.value   = match.allowText   === true
        }
      }
    }
  } catch { /* ignore */ }
  finally { isLoading.value = false }
}

/* ── polling ────────────────────────────────────── */
function startPolling() {
  fetchAll()
  pollTimer = setInterval(fetchAll, 3500)
}
function stopPolling() {
  clearInterval(pollTimer)
  pollTimer = null
}

watch(() => props.open, open => {
  if (open) { selectedGroupId.value = ''; selectedGroupName.value = ''; existingMapping.value = null; startPolling() }
  else stopPolling()
})
onMounted(() => { if (props.open) startPolling() })
onUnmounted(stopPolling)

/* ── select a group ─────────────────────────────── */
function selectGroup(g) {
  selectedGroupId.value   = g.id
  selectedGroupName.value = g.name
}

/* ── save ───────────────────────────────────────── */
async function handleSave() {
  if (!selectedGroupId.value) { toast.error('Please select a WhatsApp group first'); return }
  isSaving.value = true
  try {
    // Load all mappings, add/replace entry for this subject
    const mRes = await getWhatsAppMappings()
    let allMappings = mRes?.mappings || []

    // Remove old mapping for this same subject
    allMappings = allMappings.filter(
      m => m.subjectId !== Number(props.subjectId) && m.subject !== props.subjectName
    )

    allMappings.push({
      groupId:     selectedGroupId.value,
      groupName:   selectedGroupName.value,
      subjectId:   Number(props.subjectId),
      semesterId:  Number(props.semesterId),
      semester:    props.semesterName,
      exam:        props.exam,
      subject:     props.subjectName,
      allowImages: allowImages.value,
      allowFiles:  allowFiles.value,
      allowText:   allowText.value,
    })

    const res = await saveWhatsAppMappings(allMappings)
    if (res?.ok) {
      toast.success(`"${selectedGroupName.value}" linked to "${props.subjectName}"!`)
      existingMapping.value = allMappings[allMappings.length - 1]
      emit('close')
    } else {
      toast.error(res?.error || 'Could not save — is the bot running?')
    }
  } catch (err) {
    toast.error(err.message || 'Error saving link')
  } finally {
    isSaving.value = false
  }
}

/* ── remove ─────────────────────────────────────── */
async function handleRemove() {
  isSaving.value = true
  try {
    const mRes = await getWhatsAppMappings()
    const updated = (mRes?.mappings || []).filter(
      m => m.subjectId !== Number(props.subjectId) && m.subject !== props.subjectName
    )
    const res = await saveWhatsAppMappings(updated)
    if (res?.ok) {
      toast.info('WhatsApp link removed')
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
  <BottomSheet :open="open" title="Link WhatsApp Group" @close="emit('close')">
    <div class="space-y-5 pb-4">

      <!-- Subject badge -->
      <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40">
        <i class="fa-solid fa-book text-indigo-500 text-sm shrink-0"></i>
        <div class="min-w-0">
          <span class="text-xs text-indigo-500 font-semibold uppercase tracking-wide block">Linking to Subject</span>
          <span class="font-bold text-sm text-indigo-800 dark:text-indigo-200 truncate block">
            {{ subjectName }} &mdash; {{ semesterName }} / {{ exam }}
          </span>
        </div>
      </div>

      <!-- ════════════════════════════════════ -->
      <!-- OFFLINE STATE                        -->
      <!-- ════════════════════════════════════ -->
      <div v-if="isOffline" class="rounded-xl border border-amber-300/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-600 shrink-0">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div>
            <h4 class="font-bold text-sm text-amber-900 dark:text-amber-200">WhatsApp Bridge is not running</h4>
            <p class="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Start the bot in a separate terminal window, then come back here.
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between bg-slate-900 text-slate-100 rounded-lg p-2.5 font-mono text-xs">
          <span>npm start --prefix whatsapp-bot</span>
          <button
            class="ml-3 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors flex items-center gap-1"
            @click="() => { navigator.clipboard.writeText('npm start --prefix whatsapp-bot'); toast.success('Copied!') }"
          >
            <i class="fa-solid fa-copy text-[11px]"></i> Copy
          </button>
        </div>

        <BaseButton size="xs" variant="primary" class="w-full" @click="fetchAll">
          <i class="fa-solid fa-rotate-right mr-1.5"></i> Check again
        </BaseButton>
      </div>

      <!-- ════════════════════════════════════ -->
      <!-- QR CODE                              -->
      <!-- ════════════════════════════════════ -->
      <div v-else-if="isQrReady" class="text-center space-y-4 py-2">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-xs animate-pulse">
          <i class="fa-solid fa-qrcode"></i> Scan with WhatsApp
        </div>

        <div class="w-60 h-60 mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 flex items-center justify-center p-2">
          <img :src="botStatus.qr" alt="WhatsApp QR" class="w-full h-full object-contain rounded-xl" />
        </div>

        <div class="text-left bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-400 space-y-1.5 max-w-xs mx-auto">
          <p class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><i class="fa-solid fa-mobile-screen-button text-emerald-500"></i> How to scan:</p>
          <ol class="list-decimal list-inside space-y-1 pl-1 leading-relaxed">
            <li>Open <strong>WhatsApp</strong> on your phone</li>
            <li>Tap <strong>Settings → Linked Devices</strong></li>
            <li>Tap <strong>Link a Device</strong></li>
            <li>Point your camera at this QR code</li>
          </ol>
        </div>

        <p class="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <i class="fa-solid fa-spinner fa-spin text-emerald-500"></i> Auto-refreshing every 3 seconds...
        </p>
      </div>

      <!-- ════════════════════════════════════ -->
      <!-- CONNECTED — Group picker             -->
      <!-- ════════════════════════════════════ -->
      <div v-else-if="isConnected" class="space-y-4">

        <!-- Already linked banner -->
        <div v-if="existingMapping" class="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300/40">
          <i class="fa-brands fa-whatsapp text-emerald-500 text-xl shrink-0"></i>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">Currently linked to:</p>
            <p class="font-bold text-sm text-emerald-900 dark:text-emerald-100 truncate">{{ existingMapping.groupName }}</p>
          </div>
          <button
            class="text-xs text-red-500 hover:text-red-700 font-semibold shrink-0"
            :disabled="isSaving"
            @click="handleRemove"
          >Remove</button>
        </div>

        <!-- Select a group -->
        <div class="space-y-2">
          <p class="text-sm font-bold text-slate-800 dark:text-slate-100">
            {{ existingMapping ? 'Change group:' : 'Select a WhatsApp group:' }}
          </p>

          <div v-if="isLoading && groups.length === 0" class="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
            <i class="fa-solid fa-circle-notch fa-spin"></i> Loading your groups...
          </div>

          <div v-else-if="groups.length === 0" class="text-center py-4 text-sm text-slate-400">
            No WhatsApp groups found. Make sure you are a member of at least one group.
          </div>

          <!-- Groups list (scrollable) -->
          <div v-else class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            <button
              v-for="g in groups"
              :key="g.id"
              type="button"
              class="w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left"
              :class="selectedGroupId === g.id
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 ring-1 ring-emerald-400/30'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-400/50 hover:bg-slate-50 dark:hover:bg-slate-800/60'"
              @click="selectGroup(g)"
            >
              <!-- Radio dot -->
              <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                :class="selectedGroupId === g.id ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'">
                <div v-if="selectedGroupId === g.id" class="w-1.5 h-1.5 rounded-full bg-white"></div>
              </div>

              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{{ g.name }}</p>
                <p class="text-[11px] text-slate-400">{{ g.participantsCount }} members</p>
              </div>

              <i v-if="selectedGroupId === g.id" class="fa-solid fa-circle-check text-emerald-500 shrink-0"></i>
            </button>
          </div>
        </div>

        <!-- What to sync (only visible when a group is selected) -->
        <div v-if="selectedGroupId" class="space-y-2">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            What to auto-save from this group:
          </p>
          <div class="grid grid-cols-3 gap-2">
            <!-- Images -->
            <label
              class="flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all"
              :class="allowImages
                ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-400 text-sky-700 dark:text-sky-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400'"
            >
              <i class="fa-solid fa-image text-2xl"></i>
              <span class="text-xs font-semibold">Images</span>
              <input type="checkbox" v-model="allowImages" class="sr-only" />
              <div class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                :class="allowImages ? 'bg-sky-500 border-sky-500' : 'border-slate-300'">
                <i v-if="allowImages" class="fa-solid fa-check text-white text-[9px]"></i>
              </div>
            </label>

            <!-- Files -->
            <label
              class="flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all"
              :class="allowFiles
                ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-400 text-violet-700 dark:text-violet-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400'"
            >
              <i class="fa-solid fa-file-pdf text-2xl"></i>
              <span class="text-xs font-semibold">Files / PDF</span>
              <input type="checkbox" v-model="allowFiles" class="sr-only" />
              <div class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                :class="allowFiles ? 'bg-violet-500 border-violet-500' : 'border-slate-300'">
                <i v-if="allowFiles" class="fa-solid fa-check text-white text-[9px]"></i>
              </div>
            </label>

            <!-- Text -->
            <label
              class="flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all"
              :class="allowText
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 text-amber-700 dark:text-amber-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400'"
            >
              <i class="fa-solid fa-comment-lines text-2xl"></i>
              <span class="text-xs font-semibold">Text msgs</span>
              <input type="checkbox" v-model="allowText" class="sr-only" />
              <div class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                :class="allowText ? 'bg-amber-500 border-amber-500' : 'border-slate-300'">
                <i v-if="allowText" class="fa-solid fa-check text-white text-[9px]"></i>
              </div>
            </label>
          </div>
          <p class="text-[11px] text-slate-400 leading-relaxed">
            Only checked content types will be auto-saved from this group into <strong class="text-slate-600 dark:text-slate-300">{{ subjectName }}</strong>.
          </p>
        </div>

        <!-- Save button -->
        <BaseButton
          v-if="selectedGroupId"
          variant="primary"
          class="w-full bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/25"
          :disabled="isSaving"
          @click="handleSave"
        >
          <i class="fa-brands fa-whatsapp mr-2"></i>
          <span>{{ isSaving ? 'Saving...' : `Link "${selectedGroupName}" to ${subjectName}` }}</span>
        </BaseButton>
      </div>

      <!-- ════════════════════════════════════ -->
      <!-- CONNECTING spinner                   -->
      <!-- ════════════════════════════════════ -->
      <div v-else class="flex flex-col items-center gap-3 py-10 text-slate-400">
        <i class="fa-solid fa-circle-notch fa-spin text-3xl text-emerald-500"></i>
        <p class="text-sm">Connecting to WhatsApp bridge...</p>
      </div>

    </div>
  </BottomSheet>
</template>
