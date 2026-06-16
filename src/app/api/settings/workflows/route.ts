import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_TYPES = ['LEAVE', 'OVERTIME', 'CASH_ADVANCE', 'BUDGET', 'TIME_CORRECTION', 'PAYROLL', 'ATTENDANCE_REVIEW'] as const
type WorkflowType = (typeof ALLOWED_TYPES)[number]

// Roles that may be assigned as approvers / be eligible recipients.
const ELIGIBLE_ROLES = [
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'HR_MANAGER',
  'PAYROLL_OFFICER',
  'DEPARTMENT_HEAD',
] as const

function isAllowedType(t: string): t is WorkflowType {
  return (ALLOWED_TYPES as readonly string[]).includes(t)
}

interface StepInput {
  order: number
  stepType: 'APPROVAL' | 'NOTIFY'
  conditions?: unknown
  approverType?: string | null
  approverUserId?: string | null
  approverRole?: string | null
  notifyTarget?: string | null
  notifyUserId?: string | null
  notifyRole?: string | null
  notifyChannel?: string | null
  messageTitle?: string | null
  messageBody?: string | null
}

// GET — everything the builder UI needs: eligible users, departments, workflows.
export async function GET() {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  // The workflow tables may not be migrated yet — degrade gracefully so the
  // builder still loads its users/departments (and an empty workflow list)
  // rather than blanking the whole page on a missing-table error.
  const loadWorkflows = prisma.approvalWorkflow
    .findMany({
      where: { companyId: ctx.companyId },
      include: { steps: { orderBy: { order: 'asc' } } },
      orderBy: [{ type: 'asc' }, { departmentId: 'asc' }],
    })
    .catch((err) => {
      console.error('[settings/workflows GET] workflow load failed — run migrations', err)
      return [] as never[]
    })

  const [userCompanies, departments, workflows] = await Promise.all([
    prisma.userCompany.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        role: { in: ELIGIBLE_ROLES as unknown as string[] as never },
      },
      include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.department.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    loadWorkflows,
  ])

  const users = userCompanies
    .filter(uc => uc.user.isActive)
    .map(uc => ({ userId: uc.user.id, name: uc.user.name, email: uc.user.email, role: uc.role }))

  return NextResponse.json({ users, departments, workflows })
}

// POST — create or replace a whole workflow + its steps in one transaction.
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const body = (await req.json()) as {
    id?: string
    type: string
    name?: string
    departmentId?: string | null
    isActive?: boolean
    steps?: StepInput[]
  }

  if (!body.type || !isAllowedType(body.type)) {
    return NextResponse.json({ error: 'Invalid workflow type' }, { status: 422 })
  }

  const departmentId = body.departmentId || null
  const steps = Array.isArray(body.steps) ? body.steps : []

  // Validate department belongs to this company (null = company default).
  if (departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, companyId: ctx.companyId },
      select: { id: true },
    })
    if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 422 })
  }

  // Locate an existing workflow by id, or by the (company, type, department) slot.
  const existing = body.id
    ? await prisma.approvalWorkflow.findFirst({ where: { id: body.id, companyId: ctx.companyId } })
    : await prisma.approvalWorkflow.findFirst({
        where: { companyId: ctx.companyId, type: body.type, departmentId },
      })

  const name = body.name?.trim() || `${body.type} workflow`
  const isActive = body.isActive ?? true

  const stepData = steps.map((s, i) => ({
    order: s.order ?? i + 1,
    stepType: s.stepType === 'NOTIFY' ? 'NOTIFY' : 'APPROVAL',
    conditions: (s.conditions ?? undefined) as never,
    approverType: s.approverType ?? null,
    approverUserId: s.approverUserId ?? null,
    approverRole: s.approverRole ?? null,
    notifyTarget: s.notifyTarget ?? null,
    notifyUserId: s.notifyUserId ?? null,
    notifyRole: s.notifyRole ?? null,
    notifyChannel: s.notifyChannel ?? 'IN_APP',
    messageTitle: s.messageTitle ?? null,
    messageBody: s.messageBody ?? null,
  }))

  const saved = await prisma.$transaction(async (tx) => {
    let workflowId: string
    if (existing) {
      await tx.approvalWorkflow.update({
        where: { id: existing.id },
        data: { name, departmentId, isActive },
      })
      await tx.approvalWorkflowStep.deleteMany({ where: { workflowId: existing.id } })
      workflowId = existing.id
    } else {
      const created = await tx.approvalWorkflow.create({
        data: { companyId: ctx.companyId, type: body.type, name, departmentId, isActive },
      })
      workflowId = created.id
    }
    if (stepData.length > 0) {
      await tx.approvalWorkflowStep.createMany({
        data: stepData.map(s => ({ ...s, workflowId })),
      })
    }
    return tx.approvalWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { order: 'asc' } } },
    })
  })

  return NextResponse.json({ workflow: saved })
}

// DELETE — remove a workflow (steps cascade).
export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.approvalWorkflow.deleteMany({ where: { id, companyId: ctx.companyId } })
  return NextResponse.json({ ok: true })
}
