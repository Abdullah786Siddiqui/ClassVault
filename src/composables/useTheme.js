import { ref } from 'vue'

const THEME_STORAGE_KEY = 'classvault-theme'
const isDark = ref(false)

// Initialize theme immediately on script load
function initTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored) {
    isDark.value = stored === 'dark'
  } else {
    // Respect system preference on first launch
    isDark.value = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  }
  applyTheme()
}

function applyTheme() {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', isDark.value)
  }
}

export function useTheme() {
  function toggleTheme() {
    isDark.value = !isDark.value
    localStorage.setItem(THEME_STORAGE_KEY, isDark.value ? 'dark' : 'light')
    applyTheme()
  }

  function setTheme(dark) {
    isDark.value = Boolean(dark)
    localStorage.setItem(THEME_STORAGE_KEY, isDark.value ? 'dark' : 'light')
    applyTheme()
  }

  return {
    isDark,
    toggleTheme,
    setTheme,
    initTheme,
  }
}
