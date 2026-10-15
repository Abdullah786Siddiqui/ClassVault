import db from './db'
import { getWhatsAppInbox, ackWhatsAppInbox } from './whatsapp'
import { markRaw } from 'vue'

function base64ToBlob(base64, mimeType) {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

let isSyncing = false

/**
 * Polls the WhatsApp bridge inbox and saves new incoming images/files
 * directly into Dexie (IndexedDB) for ClassVault.
 */
export async function syncIncomingWhatsAppItems(onItemImported) {
  if (isSyncing) return []
  isSyncing = true

  try {
    const res = await getWhatsAppInbox()
    if (!res?.ok || !Array.isArray(res.items) || res.items.length === 0) {
      return []
    }

    const savedIds = []
    const importedItems = []

    for (const item of res.items) {
      if (!item.base64) {
        savedIds.push(item.id)
        continue
      }

      try {
        const mimeType = item.mimeType || (item.type === 'image' ? 'image/jpeg' : 'application/octet-stream')
        const blob = base64ToBlob(item.base64, mimeType)
        const now = item.createdAt || new Date().toISOString()
        const cleanFileName = item.fileName || `WA_${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`

        const record = {
          semesterId: Number(item.semesterId),
          subjectId: Number(item.subjectId),
          exam: item.exam,
          type: item.type || 'image',
          title: item.caption || item.title || cleanFileName,
          text: '',
          caption: item.caption || '',
          fileName: cleanFileName,
          mimeType,
          blob: markRaw(blob),
          thumbBlob: null,
          fileSize: item.fileSize || blob.size || 0,
          starred: 0,
          syncStatus: 'pending',
          driveFileId: null,
          errorMessage: '',
          retryAt: 0,
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
        }

        const id = await db.items.add(record)
        record.id = id
        savedIds.push(item.id)
        importedItems.push(record)

        if (typeof onItemImported === 'function') {
          onItemImported(record)
        }
      } catch (itemErr) {
        console.error('[WhatsAppSync] Failed to save item to Dexie:', itemErr)
        // Ack anyway so corrupted items don't loop forever
        savedIds.push(item.id)
      }
    }

    if (savedIds.length > 0) {
      await ackWhatsAppInbox(savedIds)
    }

    return importedItems
  } catch (err) {
    // If bot offline or network error, silently pass
    return []
  } finally {
    isSyncing = false
  }
}
