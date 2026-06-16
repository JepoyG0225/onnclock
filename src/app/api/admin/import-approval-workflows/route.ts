/**
 * One-time, idempotent conversion of legacy ApproverConfig chains into
 * Workflow Builder workflows (ApprovalWorkflow + steps). Non-destructive:
 * it only creates a company-default workflow where none exists yet for that
 * type, and leaves the legacy ApproverConfig rows in place as a fallback.
 *
 * SUPER_ADMIN only. Safe to run multiple times.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const TYPES = ['PAYROLL', 'LEAVE', 'OVERTIME', 'TIME_CORRECTION', 'ATTENDANCE_REVIEW'] as const

export async function POST() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (ctx.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  }

  const companies = await prisma.company.findMany({ where: { isActive: true }, select: { id: true } })

  const summary: Array<{ companyId: string; type: string; status: string; steps?: number; error?: string }> = []

  for (const company of companies) {
    for (const type of TYPES) {
      try {
        const existing = await prisma.approvalWorkflow.findFirst({
          where: { companyId: company.id, type, departmentId: null },
          select: { id: true },
        })
        if (existing) {
          summary.push({ companyId: company.id, type, status: 'already-exists' })
          continue
        }

        const approvers = await prisma.approverConfig.findMany({
          where: { companyId: company.id, type },
          orderBy: { level: 'asc' },
        })

        const created = await prisma.approvalWorkflow.create({
          data: {
            companyId: company.id,
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
          select: { id: true },
        })
        summary.push({ companyId: company.id, type, status: approvers.length ? 'imported' : 'created-empty', steps: approvers.length })
        void created
      } catch (err) {
        summary.push({ companyId: company.id, type, status: 'error', error: String(err).slice(0, 200) })
      }
    }
  }

  const imported = summary.filter(s => s.status === 'imported').length
  return NextResponse.json({ ok: true, companies: companies.length, imported, summary })
}
