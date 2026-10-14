/**
 * High-performance, cross-environment image optimization & thumbnail generator.
 * Works seamlessly in both main browser window and Service Worker environments.
 */

export async function optimizeImage(blob, maxDimension = 2048, quality = 0.82) {
  if (!blob || !(blob instanceof Blob) || !blob.type.startsWith('image/')) {
    return blob
  }

  // Non-resizable image formats (like SVG or animated GIF) should be preserved
  if (blob.type === 'image/svg+xml' || blob.type === 'image/gif') {
    return blob
  }

  // Modern / Worker environment: OffscreenCanvas + createImageBitmap
  if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      const { width, height } = bitmap

      // If already small enough and under 1.5MB, avoid re-compression
      if (width <= maxDimension && height <= maxDimension && blob.size < 1.5 * 1024 * 1024) {
        bitmap.close()
        return blob
      }

      const scale = Math.min(1, maxDimension / Math.max(width, height))
      const targetWidth = Math.max(1, Math.round(width * scale))
      const targetHeight = Math.max(1, Math.round(height * scale))

      const canvas = new OffscreenCanvas(targetWidth, targetHeight)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        bitmap.close()
        return blob
      }

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
      bitmap.close()

      const resultBlob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality,
      })
      return resultBlob || blob
    } catch (err) {
      console.warn('[ClassVault Image] OffscreenCanvas optimization fallback:', err)
    }
  }

  // Standard Window environment: HTML5 Canvas
  if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()

      img.onload = () => {
        URL.revokeObjectURL(url)
        const { width, height } = img

        if (width <= maxDimension && height <= maxDimension && blob.size < 1.5 * 1024 * 1024) {
          resolve(blob)
          return
        }

        const scale = Math.min(1, maxDimension / Math.max(width, height))
        const targetWidth = Math.max(1, Math.round(width * scale))
        const targetHeight = Math.max(1, Math.round(height * scale))

        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(blob)
          return
        }

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

        canvas.toBlob(
          (result) => resolve(result || blob),
          'image/jpeg',
          quality,
        )
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(blob)
      }

      img.src = url
    })
  }

  return blob
}

export async function generateThumbnail(blob, maxDimension = 400, quality = 0.75) {
  if (!blob || !(blob instanceof Blob) || !blob.type.startsWith('image/')) {
    return null
  }

  // Modern / Worker environment
  if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      const { width, height } = bitmap
      const scale = Math.min(1, maxDimension / Math.max(width, height))
      const targetWidth = Math.max(1, Math.round(width * scale))
      const targetHeight = Math.max(1, Math.round(height * scale))

      const canvas = new OffscreenCanvas(targetWidth, targetHeight)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        bitmap.close()
        return null
      }

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'medium'
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
      bitmap.close()

      return await canvas.convertToBlob({
        type: 'image/jpeg',
        quality,
      })
    } catch {
      return null
    }
  }

  // Standard Window environment
  if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()

      img.onload = () => {
        URL.revokeObjectURL(url)
        const { width, height } = img
        const scale = Math.min(1, maxDimension / Math.max(width, height))
        const targetWidth = Math.max(1, Math.round(width * scale))
        const targetHeight = Math.max(1, Math.round(height * scale))

        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'medium'
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

        canvas.toBlob((thumb) => resolve(thumb || null), 'image/jpeg', quality)
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }

      img.src = url
    })
  }

  return null
}
