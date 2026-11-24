/** A date-only value in the company's Philippine calendar, stored at UTC midnight. */
export function certificateIssueDate(explicit?: string, now = new Date()) {
  if (explicit) {
    const date = new Date(`${explicit}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(explicit) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== explicit) throw new Error('Enter a valid issue date.')
    return date
  }
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`)
}
export function formatCertificateDate(date: Date) {
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' })
}
