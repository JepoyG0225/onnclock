import { HolidayType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createNotificationsForUsers } from '@/lib/notifications'

const GOOGLE_SYNC_TAG = '[AUTO:GOOGLE_CALENDAR]'
const PUBLIC_SYNC_TAG = '[AUTO:PUBLIC_PH_HOLIDAYS]'
const MERGED_SYNC_TAG = '[AUTO:PH_HOLIDAYS]'
// Every tag an auto-sync has ever planted — used so a new sync cleans up rows
// from older sync strategies and never treats them as "manual".
const ALL_AUTO_TAGS = [GOOGLE_SYNC_TAG, PUBLIC_SYNC_TAG, MERGED_SYNC_TAG]
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

  // Snapshot ALL existing holiday dates (auto + manual) before we touch
  // anything, so we can tell which incoming holidays are genuinely NEW
  // (e.g. a freshly-proclaimed special day) vs. ones already on the calendar.
  const existing = await prisma.holiday.findMany({
    where: { companyId: params.companyId, date: { gte: rangeStart, lt: rangeEnd } },
    select: { date: true, description: true },
  })
  const existingDates = new Set(existing.map(h => h.date.toISOString().slice(0, 10)))

  // "Manual" = anything that wasn't planted by an auto-sync, regardless of
  // WHICH auto-sync. Earlier versions only filtered by the current tag,
  // which let Google-tagged rows hide from a Public-tagged sync (and vice
  // versa) — both syncs then layered on top of each other and we ended up
  // with two rows per holiday in the DB.
  const manualDates = new Set(
    existing
      .filter(h => !ALL_AUTO_TAGS.some(tag => (h.description ?? '').startsWith(tag)))
      .map(h => h.date.toISOString().slice(0, 10)),
  )

  // Delete EVERY auto-synced row in the year, across all tag generations.
  // Otherwise running different sync strategies leaves stale rows behind.
  await prisma.holiday.deleteMany({
    where: {
      companyId: params.companyId,
      date: { gte: rangeStart, lt: rangeEnd },
      OR: ALL_AUTO_TAGS.map(tag => ({ description: { startsWith: tag } })),
    },
  })

  const keep = params.incoming.filter(h => !manualDates.has(h.date))
  const toCreate: Prisma.HolidayCreateManyInput[] = keep.map(h => ({
    companyId: params.companyId,
    name: h.name,
    date: new Date(`${h.date}T00:00:00.000Z`),
    type: h.type,
    isRecurring: true,
    description: `${params.tag} ${h.name}`,
  }))

  if (toCreate.length > 0) {
    // Defense in depth: skipDuplicates protects us if the unique index on
    // (companyId, date) catches a race between two simultaneous syncs.
    await prisma.holiday.createMany({ data: toCreate, skipDuplicates: true })
  }

  // Newly-detected = synced holidays whose date was on NO existing row before.
  const added = keep.filter(h => !existingDates.has(h.date))

  return {
    fetched: params.incoming.length,
    imported: toCreate.length,
    skippedManual: params.incoming.length - toCreate.length,
    added,
  }
}

// Union two+ holiday lists by date. Lists are merged in priority order — the
// first list to claim a date wins its name/type (pass the richer source first).
function mergeByDate(
  lists: Array<Array<{ name: string; date: string; type: HolidayType }>>,
): Array<{ name: string; date: string; type: HolidayType }> {
  const byDate = new Map<string, { name: string; date: string; type: HolidayType }>()
  for (const list of lists) {
    for (const h of list) {
      if (!byDate.has(h.date)) byDate.set(h.date, h)
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// Best-effort in-app alert to company admins/HR when new holidays appear.
async function notifyHolidayAdditions(
  companyId: string,
  added: Array<{ name: string; date: string }>,
) {
  if (added.length === 0) return
  try {
    const recipients = await prisma.userCompany.findMany({
      where: { companyId, isActive: true, role: { in: ['COMPANY_ADMIN', 'HR_MANAGER'] } },
      select: { userId: true },
    })
    const userIds = recipients.map(r => r.userId)
    if (userIds.length === 0) return
    const fmt = (iso: string) =>
      new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    const list = added.slice(0, 5).map(a => `${fmt(a.date)} — ${a.name}`).join('; ')
    const extra = added.length > 5 ? ` (+${added.length - 5} more)` : ''
    await createNotificationsForUsers(userIds, {
      companyId,
      type: 'GENERIC',
      title: added.length === 1 ? 'New holiday detected' : `${added.length} new holidays detected`,
      body: `${list}${extra}. Review payroll runs that cover these dates.`,
      link: '/holidays',
    })
  } catch (err) {
    console.error('[holidays] notifyHolidayAdditions failed', err)
  }
}

/**
 * Merged PH holiday sync for one company/year. Pulls from BOTH Google Calendar
 * (when an API key is configured — it carries proclaimed special days) AND the
 * Nager.Date public API, unions them, upserts (preserving manual entries), and
 * notifies HR of any genuinely-new holidays. Either source failing is
 * tolerated; the other still applies.
 */
export async function syncCompanyHolidays(params: {
  companyId: string
  year: number
  apiKey?: string
  calendarId?: string
}) {
  const lists: Array<Array<{ name: string; date: string; type: HolidayType }>> = []
  const sources: string[] = []

  if (params.apiKey) {
    try {
      lists.push(await fetchGoogleHolidaysForYear({ year: params.year, apiKey: params.apiKey, calendarId: params.calendarId }))
      sources.push('google_calendar')
    } catch (err) {
      console.error('[holidays] Google Calendar fetch failed', err)
    }
  }
  try {
    lists.push(await fetchPublicPhHolidaysForYear({ year: params.year }))
    sources.push('public_holiday_api')
  } catch (err) {
    console.error('[holidays] Nager.Date fetch failed', err)
  }

  if (lists.length === 0) {
    throw new Error('All holiday sources failed')
  }

  // Google first so its richer proclamation names/types win on shared dates.
  const incoming = mergeByDate(lists)
  const result = await upsertAutoSyncedHolidays({
    companyId: params.companyId,
    year: params.year,
    incoming,
    tag: MERGED_SYNC_TAG,
  })
  await notifyHolidayAdditions(params.companyId, result.added)
  return { ...result, sources }
}

// Back-compat wrappers (kept so any other callers keep working) — both now
// route through the merged sync.
export async function syncCompanyGoogleHolidays(params: {
  companyId: string
  year: number
  apiKey: string
  calendarId?: string
}) {
  return syncCompanyHolidays(params)
}

export async function syncCompanyPublicPhHolidays(params: {
  companyId: string
  year: number
}) {
  return syncCompanyHolidays(params)
}

export const GoogleHolidaySync = {
  tag: GOOGLE_SYNC_TAG,
  defaultCalendarId: DEFAULT_CALENDAR_ID,
}

export const PublicHolidaySync = {
  tag: PUBLIC_SYNC_TAG,
}
