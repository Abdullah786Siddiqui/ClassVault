import { ref } from 'vue'

const toasts = ref([])
let nextId = 1

export function useToast() {
  function showToast(message, type = 'info', duration = 3500) {
    const id = nextId++
    const toast = { id, message, type }
    toasts.value.push(toast)

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
    return id
  }

  function removeToast(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function success(message, duration) {
    return showToast(message, 'success', duration)
  }

  function error(message, duration = 5000) {
    return showToast(message, 'error', duration)
  }

  function info(message, duration) {
    return showToast(message, 'info', duration)
  }

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    info,
  }
}
