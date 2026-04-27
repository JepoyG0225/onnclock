export const MANILA_TIME_ZONE = 'Asia/Manila'

function getManilaYmd(base: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Failed to resolve Manila date parts')
  }

  return { year, month, day }
}

export function getManilaDateOnly(base: Date = new Date()): Date {
  const { year, month, day } = getManilaYmd(base)
  return new Date(`${year}-${month}-${day}`)
}

export function getManilaDateString(base: Date = new Date()): string {
  const { year, month, day } = getManilaYmd(base)
  return `${year}-${month}-${day}`
}

export function getManilaDayOfWeek(base: Date = new Date()): number {
  const { year, month, day } = getManilaYmd(base)
  const utcMidnight = new Date(`${year}-${month}-${day}T00:00:00.000Z`)
  return utcMidnight.getUTCDay()
}
