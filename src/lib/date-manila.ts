export function getManilaDateOnly(base: Date = new Date()): Date {
  const manilaOffsetMs = 8 * 60 * 60 * 1000
  const manila = new Date(base.getTime() + manilaOffsetMs)
  const yyyy = manila.getUTCFullYear()
  const mm = String(manila.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(manila.getUTCDate()).padStart(2, '0')
  return new Date(`${yyyy}-${mm}-${dd}`)
}

