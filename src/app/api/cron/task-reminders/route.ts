import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTaskReminders } from '@/lib/tasks/reminders'

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const companies = await prisma.task.findMany({
    where: { completedAt: null, OR: [{ dueDate: { not: null } }, { startDate: { not: null } }] },
    distinct: ['companyId'], select: { companyId: true },
  })
  let sent = 0
  for (const { companyId } of companies) sent += await sendTaskReminders(companyId)
  return NextResponse.json({ sent })
}
