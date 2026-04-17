import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

const PHASES = ['PRE_BOARDING', 'DAY_1', 'WEEK_1', 'MONTH_1', 'MONTH_3'] as const
const OWNER_TYPES = ['HR', 'IT', 'MANAGER', 'EMPLOYEE', 'FINANCE'] as const
const STEP_TYPES = ['DOCUMENT', 'VIDEO', 'TASK', 'ORIENTATION', 'SYSTEM_ACCESS', 'POLICY_ACKNOWLEDGEMENT'] as const

const taskSchema = z.object({
  title: z.string().trim().min(2),
  phase: z.enum(PHASES).default('PRE_BOARDING'),
  ownerType: z.enum(OWNER_TYPES).default('HR'),
  stepType: z.enum(STEP_TYPES).default('TASK'),
  dueDaysFromStart: z.number().int().min(0).default(0),
  isRequired: z.boolean().default(true),
  resourceUrl: z.string().max(2000).optional().nullable(),
})

const createTemplateSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().max(500).optional().nullable(),
  tasks: z.array(taskSchema).min(1),
  isDefault: z.boolean().optional().default(false),
})

export async function GET() {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const templates = await prisma.onboardingTemplate.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    include: {
      steps: {
        orderBy: [{ sortOrder: 'asc' }],
        select: {
          id: true,
          title: true,
          isRequired: true,
          sortOrder: true,
          dueDaysFromStart: true,
          stepType: true,
          metadata: true,
        },
      },
    },
  })

  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const body = await req.json().catch(() => null)
  const parsed = createTemplateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, description, tasks, isDefault } = parsed.data

  const template = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.onboardingTemplate.updateMany({
        where: { companyId: ctx.companyId, isDefault: true },
        data: { isDefault: false },
      })
    }

    const created = await tx.onboardingTemplate.create({
      data: {
        companyId: ctx.companyId,
        name: name.trim(),
        description: description?.trim() || null,
        isDefault,
        createdByUserId: ctx.userId,
      },
    })

    await tx.onboardingTemplateStep.createMany({
      data: tasks.map((task, index) => ({
        templateId: created.id,
        title: task.title,
        stepType: task.stepType,
        isRequired: task.isRequired,
        sortOrder: index + 1,
        dueDaysFromStart: task.dueDaysFromStart,
        metadata: {
          phase: task.phase,
          ownerType: task.ownerType,
          ...(task.resourceUrl ? { resourceUrl: task.resourceUrl } : {}),
        },
      })),
    })

    return tx.onboardingTemplate.findUnique({
      where: { id: created.id },
      include: {
        steps: {
          orderBy: [{ sortOrder: 'asc' }],
          select: {
            id: true,
            title: true,
            isRequired: true,
            sortOrder: true,
            dueDaysFromStart: true,
            stepType: true,
            metadata: true,
          },
        },
      },
    })
  })

  return NextResponse.json({ template }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Template ID required' }, { status: 400 })

  const template = await prisma.onboardingTemplate.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.onboardingTemplate.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ ok: true })
}
