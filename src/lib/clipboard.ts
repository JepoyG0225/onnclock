export function absoluteAppUrl(path: string): string {
  if (typeof window === 'undefined' || !window.location.origin) {
    throw new Error('The public URL is not available yet.')
  }

  return new URL(path, window.location.origin).toString()
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (!text.trim()) throw new Error('There is no link to copy.')

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Some embedded browsers expose the Clipboard API but deny writes.
      // Fall through to the selection-based copy method below.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    if (!document.execCommand('copy')) throw new Error('Copy command failed.')
  } finally {
    textarea.remove()
  }
}
