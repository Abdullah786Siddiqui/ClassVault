import { ref, watch, onUnmounted, isRef } from 'vue'

/**
 * Creates and revokes an object URL safely, avoiding memory leaks.
 * Accepts a Blob/File, a ref containing a Blob/File, or a getter function.
 */
export function useObjectUrl(blobSource) {
  const url = ref('')

  function updateUrl(blob) {
    if (url.value) {
      URL.revokeObjectURL(url.value)
      url.value = ''
    }

    if (blob && (blob instanceof Blob || blob instanceof File)) {
      url.value = URL.createObjectURL(blob)
    }
  }

  if (isRef(blobSource)) {
    watch(
      blobSource,
      (newBlob) => {
        updateUrl(newBlob)
      },
      { immediate: true },
    )
  } else if (typeof blobSource === 'function') {
    watch(
      blobSource,
      (newBlob) => {
        updateUrl(newBlob)
      },
      { immediate: true },
    )
  } else {
    updateUrl(blobSource)
  }

  onUnmounted(() => {
    if (url.value) {
      URL.revokeObjectURL(url.value)
      url.value = ''
    }
  })

  return url
}
