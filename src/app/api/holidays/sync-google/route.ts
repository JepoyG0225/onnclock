import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import {
  GoogleHolidaySync,
  syncCompanyGoogleHolidays,
  syncCompanyPublicPhHolidays,
} from '@/lib/holidays/google-calendar'

const bodySchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
})

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const year = parsed.data.year ?? new Date().getFullYear()
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY
  const calendarId = process.env.GOOGLE_HOLIDAY_CALENDAR_ID || GoogleHolidaySync.defaultCalendarId

  try {
    if (apiKey) {
      const result = await syncCompanyGoogleHolidays({
        companyId: ctx.companyId,
        year,
        apiKey,
        calendarId,
      })
      return NextResponse.json({ year, source: 'google_calendar', ...result })
    }

    const result = await syncCompanyPublicPhHolidays({
      companyId: ctx.companyId,
      year,
    })
    return NextResponse.json({ year, source: 'public_holiday_api', ...result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Google holiday sync failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
