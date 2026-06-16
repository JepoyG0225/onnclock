import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

const createProcessSchema = z.object({
  employeeId: z.string().trim().min(1),
  templateId: z.string().trim().min(1).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

const STEP_SELECT = {
  id: true,
  title: true,
  stepType: true,
  status: true,
  isRequired: true,
  sortOrder: true,
  dueDate: true,
  completedAt: true,
  assigneeUserId: true,
  notes: true,
  proofUrl: true,
  metadata: true,
} as const

export async function GET() {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const processes = await prisma.onboardingProcess.findMany({
    where: { companyId: ctx.companyId },
    orderBy: [{ createdAt: 'desc' }],
    include: {
      employee: {
        select: {
          id: true,
          employeeNo: true,
          firstName: true,
          lastName: true,
          hireDate: true,
          photoUrl: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
      template: {
        select: { id: true, name: true },
      },
      steps: {
        orderBy: [{ sortOrder: 'asc' }],
        select: STEP_SELECT,
      },
    },
  })

  return NextResponse.json({ processes })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const body = await req.json().catch(() => null)
  const parsed = createProcessSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const employee = await prisma.employee.findFirst({
    where: { id: parsed.data.employeeId, companyId: ctx.companyId, isActive: true },
    select: { id: true, hireDate: true },
  })
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  let templateSteps: Array<{
    id: string
    title: string
    stepType: 'DOCUMENT' | 'VIDEO' | 'TASK' | 'ORIENTATION' | 'SYSTEM_ACCESS' | 'POLICY_ACKNOWLEDGEMENT'
    isRequired: boolean
    sortOrder: number
    dueDaysFromStart: number | null
    metadata: unknown
  }> = []

  if (parsed.data.templateId) {
    const template = await prisma.onboardingTemplate.findFirst({
      where: { id: parsed.data.templateId, companyId: ctx.companyId, isActive: true },
      include: {
        steps: {
          orderBy: [{ sortOrder: 'asc' }],
          select: {
            id: true,
            title: true,
            stepType: true,
            isRequired: true,
            sortOrder: true,
            dueDaysFromStart: true,
            metadata: true,
          },
        },
      },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    templateSteps = template.steps
  }

  if (templateSteps.length === 0) {
    return NextResponse.json(
      { error: 'Select a template to start onboarding.' },
      { status: 400 }
    )
  }

  const activeProcess = await prisma.onboardingProcess.findFirst({
    where: {
      companyId: ctx.companyId,
      employeeId: employee.id,
      status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
    },
    select: { id: true },
  })

  if (activeProcess) {
    return NextResponse.json(
      { error: 'This employee already has an active onboarding process.' },
      { status: 409 }
    )
  }

  const now = new Date()
  const startDate = employee.hireDate ?? now

  const process = await prisma.$transaction(async (tx) => {
    const created = await tx.onboardingProcess.create({
      data: {
        companyId: ctx.companyId,
        employeeId: employee.id,
        templateId: parsed.data.templateId || null,
        status: 'IN_PROGRESS',
        startedAt: startDate,
        ownerUserId: ctx.userId,
        notes: parsed.data.notes?.trim() || null,
      },
    })

    const stepRows = templateSteps.map((step) => ({
      processId: created.id,
      templateStepId: step.id,
      title: step.title,
      stepType: step.stepType,
      isRequired: step.isRequired,
      sortOrder: step.sortOrder,
      dueDate:
        step.dueDaysFromStart != null
          ? new Date(startDate.getTime() + step.dueDaysFromStart * 24 * 60 * 60 * 1000)
          : null,
      metadata: step.metadata ?? {},
    }))

    await tx.onboardingStepProgress.createMany({ data: stepRows })

    return tx.onboardingProcess.findUnique({
      where: { id: created.id },
      include: {
        employee: {
          select: {
            id: true,
            employeeNo: true,
            firstName: true,
            lastName: true,
            hireDate: true,
            photoUrl: true,
            department: { select: { name: true } },
            position: { select: { title: true } },
          },
        },
        template: { select: { id: true, name: true } },
        steps: {
          orderBy: [{ sortOrder: 'asc' }],
          select: STEP_SELECT,
        },
      },
    })
  })

  return NextResponse.json({ process }, { status: 201 })
}
