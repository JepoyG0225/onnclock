import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const [total, stageCounts, recent] = await Promise.all([
    prisma.jobApplication.count({ where: { companyId: ctx.companyId } }),
    prisma.jobApplication.groupBy({
      by: ['stage'],
      where: { companyId: ctx.companyId },
      _count: { _all: true },
    }),
    prisma.jobApplication.findMany({
      where: { companyId: ctx.companyId },
      select: { appliedAt: true, hiredAt: true },
      orderBy: { appliedAt: 'desc' },
      take: 300,
    }),
  ])

  const stageMap = Object.fromEntries(stageCounts.map(item => [item.stage, item._count._all]))
  const hired = Number(stageMap.HIRED ?? 0)
  const interviewed = Number((stageMap.INTERVIEW ?? 0) + (stageMap.FINAL_INTERVIEW ?? 0))
  const conversionRate = total > 0 ? Number(((hired / total) * 100).toFixed(1)) : 0

  let avgTimeToHireDays = 0
  const durations = recent
    .filter(item => item.hiredAt)
    .map(item => (new Date(item.hiredAt as Date).getTime() - new Date(item.appliedAt).getTime()) / 86_400_000)
    .filter(value => Number.isFinite(value) && value >= 0)
  if (durations.length > 0) {
    avgTimeToHireDays = Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(1))
  }

  return NextResponse.json({
    totals: {
      totalApplications: total,
      interviewed,
      hired,
      conversionRate,
      avgTimeToHireDays,
    },
    stageCounts: stageMap,
  })
}
