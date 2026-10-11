/**
 * Format bytes into human-readable size (KB, MB, GB).
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = (bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)
  return `${size} ${units[index] || 'B'}`
}

/**
 * Format date into concise, student-friendly string.
 */
export function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format relative or short date for cards.
 */
export function formatShortDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}
