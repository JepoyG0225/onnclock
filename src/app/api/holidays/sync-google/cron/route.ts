import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  GoogleHolidaySync,
  syncCompanyHolidays,
} from '@/lib/holidays/google-calendar'

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
  const years = [now.getUTCFullYear(), now.getUTCFullYear() + 1]
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  const summary: Array<{ companyId: string; year: number; imported: number; skippedManual: number; fetched: number; addedCount: number }> = []

  for (const company of companies) {
    for (const year of years) {
      try {
        const result = await syncCompanyHolidays({ companyId: company.id, year, apiKey, calendarId })
        summary.push({
          companyId: company.id,
          year,
          imported: result.imported,
          skippedManual: result.skippedManual,
          fetched: result.fetched,
          addedCount: result.added.length,
        })
      } catch (err) {
        console.error('[holidays cron] sync failed', { companyId: company.id, year, err })
      }
    }
  }

  const totalAdded = summary.reduce((s, r) => s + r.addedCount, 0)

  return NextResponse.json({
    ok: true,
    source: apiKey ? 'google_calendar+public_holiday_api' : 'public_holiday_api',
    companies: companies.length,
    syncedYears: years,
    totalAdded,
    summary,
  })
}
