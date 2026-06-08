/**
 * Convert THIS company's legacy ApproverConfig chains into Workflow Builder
 * workflows (company-default, sequential Specific-user approval steps).
 * Idempotent and non-destructive — only creates a workflow where none exists
 * yet for that type; legacy rows remain as a fallback. Company Admin only.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const TYPES = ['PAYROLL', 'LEAVE', 'OVERTIME', 'TIME_CORRECTION', 'ATTENDANCE_REVIEW'] as const

export async function POST() {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN'])
  if (error) return error

  const results: Array<{ type: string; status: string; steps?: number }> = []

  for (const type of TYPES) {
    const existing = await prisma.approvalWorkflow.findFirst({
      where: { companyId: ctx.companyId, type, departmentId: null },
      select: { id: true },
    })
    if (existing) {
      results.push({ type, status: 'already-exists' })
      continue
    }

    const approvers = await prisma.approverConfig.findMany({
      where: { companyId: ctx.companyId, type },
      orderBy: { level: 'asc' },
    })

    // Create a company-default builder workflow even when there are no legacy
    // approvers — it becomes an empty, editable builder card the admin can add
    // steps to (matching the other types' UI).
    await prisma.approvalWorkflow.create({
      data: {
        companyId: ctx.companyId,
        type,
        name: `${type} — Company default`,
        departmentId: null,
        isActive: true,
        steps: {
          create: approvers.map((a, i) => ({
            order: i + 1,
            stepType: 'APPROVAL',
            approverType: 'SPECIFIC_USER',
            approverUserId: a.userId,
          })),
        },
      },
    })
    results.push({ type, status: approvers.length ? 'imported' : 'created-empty', steps: approvers.length })
  }

  const imported = results.filter(r => r.status === 'imported').length
  return NextResponse.json({ ok: true, imported, results })
}
