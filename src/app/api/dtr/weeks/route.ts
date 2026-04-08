import { NextRequest, NextResponse } from 'next/server'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

type WeekBucket = {
  start: string
  end: string
  recordCount: number
  employeeIds: Set<string>
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const completed = searchParams.get('completed')

  const rows = await prisma.dTRRecord.findMany({
    where: {
      employee: { companyId: ctx.companyId },
      ...(completed === '1' || completed === 'true' ? { timeOut: { not: null } } : {}),
    },
    select: { date: true, employeeId: true },
    orderBy: { date: 'desc' },
    take: 10000,
  })

  const buckets = new Map<string, WeekBucket>()
  for (const row of rows) {
    const ws = startOfWeek(row.date, { weekStartsOn: 1 })
    const we = endOfWeek(row.date, { weekStartsOn: 1 })
    const key = format(ws, 'yyyy-MM-dd')
    if (!buckets.has(key)) {
      buckets.set(key, {
        start: key,
        end: format(we, 'yyyy-MM-dd'),
        recordCount: 0,
        employeeIds: new Set<string>(),
      })
    }
    const bucket = buckets.get(key)!
    bucket.recordCount += 1
    bucket.employeeIds.add(row.employeeId)
  }

  const weeks = Array.from(buckets.values())
    .sort((a, b) => b.start.localeCompare(a.start))
    .map(w => ({
      start: w.start,
      end: w.end,
      recordCount: w.recordCount,
      employeeCount: w.employeeIds.size,
    }))

  return NextResponse.json({ weeks })
}
