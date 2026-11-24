import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  GoogleHolidaySync,
  type HolidaySourceCache,
  syncCompanyHolidays,
} from '@/lib/holidays/google-calendar'

export const maxDuration = 300

function isAuthorized(req: NextRequest) {
  const configured = process.env.CRON_SECRET
  if (!configured) return false

  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  return token === configured
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY
  const calendarId = process.env.GOOGLE_HOLIDAY_CALENDAR_ID || GoogleHolidaySync.defaultCalendarId

  const now = new Date()
  const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(now))
  const years = [year, year + 1]
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  const summary: Array<{ companyId: string; year: number; imported: number; skippedManual: number; fetched: number; addedCount: number }> = []

  const sourceCache: HolidaySourceCache = new Map()
  let failures = 0
  for (const company of companies) {
    for (const year of years) {
      try {
        const result = await syncCompanyHolidays({ companyId: company.id, year, apiKey, calendarId, sourceCache })
        summary.push({
          companyId: company.id,
          year,
          imported: result.imported,
          skippedManual: result.skippedManual,
          fetched: result.fetched,
          addedCount: result.added.length,
        })
      } catch (err) {
        failures++
        console.error('[holidays cron] sync failed', { companyId: company.id, year, err })
      }
    }
  }

  const totalAdded = summary.reduce((s, r) => s + r.addedCount, 0)

  return NextResponse.json({
    ok: failures === 0,
    failures,
    source: apiKey ? 'google_calendar+public_holiday_api' : 'public_holiday_api',
    companies: companies.length,
    syncedYears: years,
    totalAdded,
    summary,
  }, { status: failures ? 500 : 200 })
}
