/** Shared browser/server validation. Files go directly to private storage. */
export const MAX_RESUME_BYTES = 10 * 1024 * 1024
export const RESUME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function resumeFileType(file: { name: string; type: string; size: number }) {
  if (!Number.isInteger(file.size) || file.size <= 0) throw new Error('The résumé file is empty. Choose a PDF, DOC, or DOCX file.')
  if (file.size > MAX_RESUME_BYTES) throw new Error('Resume file exceeds the 10 MB size limit.')
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mime = RESUME_TYPES[extension]
  if (!mime || (file.type && file.type !== 'application/octet-stream' && file.type !== mime)) {
    throw new Error('Resume must be a PDF, DOC, or DOCX file.')
  }
  return { extension, mime }
}

/** Hosting errors can be HTML, plain text, or empty (including Safari's JSON SyntaxError). */
export async function applicationResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error :
      response.status === 413 ? 'The upload was too large. Please choose a résumé up to 10 MB and try again.' :
      response.status >= 500 ? 'The application service is temporarily unavailable. Please try again.' :
      'Unable to submit your application. Please check your details and try again.'
    throw new Error(message)
  }
  if (!data) throw new Error('The server returned an unexpected response. Please try again.')
  return data as T
}
