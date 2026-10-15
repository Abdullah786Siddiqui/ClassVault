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
let hasMigratedTypes = false

/**
 * Polls the WhatsApp bridge inbox and saves new incoming images/files
 * directly into Dexie (IndexedDB) for ClassVault.
 */
export async function syncIncomingWhatsAppItems(onItemImported) {
  // Fix any items previously saved as 'image' to 'photo'
  if (!hasMigratedTypes) {
    try {
      const updated = await db.items.where('type').equals('image').modify({ type: 'photo' })
      if (updated > 0) {
        console.log(`[WhatsAppSync] Migrated ${updated} items to type 'photo'`)
        if (typeof onItemImported === 'function') {
          onItemImported({ type: 'photo', forceReload: true })
        }
      }
      hasMigratedTypes = true
    } catch {
      hasMigratedTypes = true
    }
  }

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
      // 1. Text Message: Append into a single "WhatsApp Notes" note per subject & exam
      if (item.type === 'text') {
        const textContent = (item.text || '').trim()
        if (!textContent) {
          savedIds.push(item.id)
          continue
        }

        try {
          const dateStr = new Intl.DateTimeFormat('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(item.createdAt || Date.now()))

          const sender = item.senderName ? ` [${item.senderName}]` : ''
          const newSection = `### 💬 ${dateStr}${sender}\n${textContent}`

          // Find existing "WhatsApp Notes" for this subject and exam
          const existingNote = await db.items
            .where('[semesterId+subjectId+exam]')
            .equals([Number(item.semesterId), Number(item.subjectId), item.exam])
            .filter((i) => i.type === 'text' && (i.title === 'WhatsApp Notes' || i.title === 'WhatsApp Text Notes'))
            .first()

          let record = null
          const now = new Date().toISOString()

          if (existingNote) {
            const combined = existingNote.text
              ? `${existingNote.text}\n\n---\n\n${newSection}`
              : newSection
            await db.items.update(existingNote.id, {
              text: combined,
              updatedAt: now,
            })
            record = { ...existingNote, text: combined, updatedAt: now }
          } else {
            const newNote = {
              semesterId: Number(item.semesterId),
              subjectId: Number(item.subjectId),
              exam: item.exam,
              type: 'text',
              title: 'WhatsApp Notes',
              text: newSection,
              caption: '',
              fileName: '',
              mimeType: 'text/plain',
              blob: null,
              thumbBlob: null,
              fileSize: 0,
              starred: 0,
              syncStatus: 'pending',
              driveFileId: null,
              errorMessage: '',
              retryAt: 0,
              retryCount: 0,
              createdAt: now,
              updatedAt: now,
            }
            const id = await db.items.add(newNote)
            record = { ...newNote, id }
          }

          savedIds.push(item.id)
          importedItems.push(record)

          if (typeof onItemImported === 'function') {
            onItemImported(record)
          }
        } catch (textErr) {
          console.error('[WhatsAppSync] Error appending text message:', textErr)
          savedIds.push(item.id)
        }
        continue
      }

      // 2. Media Message (Photo / File)
      if (!item.base64) {
        savedIds.push(item.id)
        continue
      }

      try {
        const mimeType = item.mimeType || (item.type === 'image' || item.type === 'photo' ? 'image/jpeg' : 'application/octet-stream')
        const blob = base64ToBlob(item.base64, mimeType)
        const now = item.createdAt || new Date().toISOString()
        const cleanFileName = item.fileName || `WA_${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`
        
        // ClassVault tabs use: 'photo', 'file', 'text'
        const normalizedType = (item.type === 'image' || item.type === 'photo') 
          ? 'photo' 
          : (item.type === 'file' ? 'file' : 'text')

        const record = {
          semesterId: Number(item.semesterId),
          subjectId: Number(item.subjectId),
          exam: item.exam,
          type: normalizedType,
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
        savedIds.push(item.id)
      }
    }

    if (savedIds.length > 0) {
      await ackWhatsAppInbox(savedIds)
    }

    return importedItems
  } catch (err) {
    return []
  } finally {
    isSyncing = false
  }
}
