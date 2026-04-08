import { HolidayType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const GOOGLE_SYNC_TAG = '[AUTO:GOOGLE_CALENDAR]'
const PUBLIC_SYNC_TAG = '[AUTO:PUBLIC_PH_HOLIDAYS]'
const DEFAULT_CALENDAR_ID = 'en.philippines#holiday@group.v.calendar.google.com'

type GoogleCalendarEvent = {
  summary?: string
  start?: {
    date?: string
    dateTime?: string
  }
}

type PublicHolidayItem = {
  date?: string
  localName?: string
  name?: string
  types?: string[]
}

function normalizeDateOnly(value?: string | null): string | null {
  if (!value) return null
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(value)
  return match ? match[0] : null
}

function classifyHolidayType(name: string): HolidayType {
  const text = name.toLowerCase()
  if (text.includes('special working')) return 'SPECIAL_WORKING'
  if (text.includes('special non-working') || text.includes('special non working')) {
    return 'SPECIAL_NON_WORKING'
  }
  if (text.includes('special holiday') || text.includes('special day')) {
    return 'SPECIAL_NON_WORKING'
  }
  return 'REGULAR'
}

export async function fetchGoogleHolidaysForYear(params: {
  year: number
  apiKey: string
  calendarId?: string
}): Promise<Array<{ name: string; date: string; type: HolidayType }>> {
  const calendarId = encodeURIComponent(params.calendarId || DEFAULT_CALENDAR_ID)
  const timeMin = `${params.year}-01-01T00:00:00Z`
  const timeMax = `${params.year + 1}-01-01T00:00:00Z`
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
    `?key=${encodeURIComponent(params.apiKey)}` +
    `&timeMin=${encodeURIComponent(timeMin)}` +
    `&timeMax=${encodeURIComponent(timeMax)}` +
    '&singleEvents=true&orderBy=startTime&maxResults=2500'

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Google Calendar API failed (${res.status}): ${detail || 'No details'}`)
  }

  const json = (await res.json()) as { items?: GoogleCalendarEvent[] }
  const byDate = new Map<string, { name: string; date: string; type: HolidayType }>()

  for (const item of json.items ?? []) {
    const date = normalizeDateOnly(item.start?.date)
    if (!date) continue
    if (new Date(`${date}T00:00:00Z`).getUTCFullYear() !== params.year) continue
    const name = (item.summary || '').trim()
    if (!name) continue
    if (!byDate.has(date)) {
      byDate.set(date, {
        name,
        date,
        type: classifyHolidayType(name),
      })
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchPublicPhHolidaysForYear(params: {
  year: number
}): Promise<Array<{ name: string; date: string; type: HolidayType }>> {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${params.year}/PH`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Public holiday API failed (${res.status}): ${detail || 'No details'}`)
  }

  const json = (await res.json()) as PublicHolidayItem[]
  const byDate = new Map<string, { name: string; date: string; type: HolidayType }>()

  for (const item of json ?? []) {
    const date = normalizeDateOnly(item.date)
    if (!date) continue
    if (new Date(`${date}T00:00:00Z`).getUTCFullYear() !== params.year) continue
    const name = (item.name || item.localName || '').trim()
    if (!name) continue
    if (!byDate.has(date)) {
      byDate.set(date, {
        name,
        date,
        type: classifyHolidayType(name),
      })
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

async function upsertAutoSyncedHolidays(params: {
  companyId: string
  year: number
  incoming: Array<{ name: string; date: string; type: HolidayType }>
  tag: string
}) {
  const rangeStart = new Date(Date.UTC(params.year, 0, 1))
  const rangeEnd = new Date(Date.UTC(params.year + 1, 0, 1))

  const manual = await prisma.holiday.findMany({
    where: {
      companyId: params.companyId,
      date: { gte: rangeStart, lt: rangeEnd },
      NOT: {
        description: { startsWith: params.tag },
      },
    },
    select: { date: true },
  })

  const manualDates = new Set(
    manual.map(h => h.date.toISOString().slice(0, 10)),
  )

  await prisma.holiday.deleteMany({
    where: {
      companyId: params.companyId,
      date: { gte: rangeStart, lt: rangeEnd },
      description: { startsWith: params.tag },
    },
  })

  const toCreate: Prisma.HolidayCreateManyInput[] = params.incoming
    .filter(h => !manualDates.has(h.date))
    .map(h => ({
      companyId: params.companyId,
      name: h.name,
      date: new Date(`${h.date}T00:00:00.000Z`),
      type: h.type,
      isRecurring: true,
      description: `${params.tag} ${h.name}`,
    }))

  if (toCreate.length > 0) {
    await prisma.holiday.createMany({ data: toCreate })
  }

  return {
    fetched: params.incoming.length,
    imported: toCreate.length,
    skippedManual: params.incoming.length - toCreate.length,
  }
}

export async function syncCompanyGoogleHolidays(params: {
  companyId: string
  year: number
  apiKey: string
  calendarId?: string
}) {
  const incoming = await fetchGoogleHolidaysForYear({
    year: params.year,
    apiKey: params.apiKey,
    calendarId: params.calendarId,
  })
  return upsertAutoSyncedHolidays({
    companyId: params.companyId,
    year: params.year,
    incoming,
    tag: GOOGLE_SYNC_TAG,
  })
}

export async function syncCompanyPublicPhHolidays(params: {
  companyId: string
  year: number
}) {
  const incoming = await fetchPublicPhHolidaysForYear({ year: params.year })
  return upsertAutoSyncedHolidays({
    companyId: params.companyId,
    year: params.year,
    incoming,
    tag: PUBLIC_SYNC_TAG,
  })
}

export const GoogleHolidaySync = {
  tag: GOOGLE_SYNC_TAG,
  defaultCalendarId: DEFAULT_CALENDAR_ID,
}

export const PublicHolidaySync = {
  tag: PUBLIC_SYNC_TAG,
}
