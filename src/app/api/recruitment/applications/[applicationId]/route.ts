import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'
import { sendRecruitmentStageEmail } from '@/lib/mailer'

const updateApplicationSchema = z.object({
  stage: z.enum(['APPLIED', 'SCREENING', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN']).optional(),
  internalNotes: z.string().nullable().optional(),
  hiredEmployeeId: z.string().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { applicationId } = await params
  const application = await prisma.jobApplication.findFirst({
    where: { id: applicationId, companyId: ctx.companyId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      currentAddress: true,
      expectedSalary: true,
      resumeUrl: true,
      coverLetter: true,
      requirementAnswers: true,
      stage: true,
      appliedAt: true,
      lastStageUpdatedAt: true,
      internalNotes: true,
      source: true,
      hiredAt: true,
      rejectedAt: true,
      hiredEmployeeId: true,
      jobPost: { select: { id: true, title: true } },
    },
  })

  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  return NextResponse.json({ application })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { applicationId } = await params
  const body = await req.json().catch(() => null)
  const parsed = updateApplicationSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const current = await prisma.jobApplication.findFirst({
    where: { id: applicationId, companyId: ctx.companyId },
    select: { id: true, stage: true },
  })

  if (!current) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const nextStage = parsed.data.stage
  const hiredEmployeeId = parsed.data.hiredEmployeeId

  if (hiredEmployeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: hiredEmployeeId, companyId: ctx.companyId },
      select: { id: true },
    })
    if (!employee) {
      return NextResponse.json({ error: 'Hired employee not found in this company' }, { status: 400 })
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date()

    const application = await tx.jobApplication.update({
      where: { id: applicationId },
      data: {
        ...(nextStage ? { stage: nextStage, lastStageUpdatedAt: now, reviewedByUserId: ctx.userId } : {}),
        ...(parsed.data.internalNotes !== undefined ? { internalNotes: parsed.data.internalNotes } : {}),
        ...(hiredEmployeeId !== undefined ? { hiredEmployeeId } : {}),
        ...(nextStage === 'HIRED' ? { hiredAt: now } : {}),
        ...(nextStage === 'REJECTED' ? { rejectedAt: now } : {}),
      },
    })

    if (nextStage === 'HIRED' && hiredEmployeeId) {
      const existingProcess = await tx.onboardingProcess.findFirst({
        where: { applicationId: application.id },
        select: { id: true },
      })

      if (!existingProcess) {
        const template = await tx.onboardingTemplate.findFirst({
          where: {
            companyId: ctx.companyId,
            isActive: true,
            isDefault: true,
          },
          include: {
            steps: {
              orderBy: [{ sortOrder: 'asc' }],
            },
          },
        })

        const onboardingProcess = await tx.onboardingProcess.create({
          data: {
            companyId: ctx.companyId,
            employeeId: hiredEmployeeId,
            applicationId: application.id,
            templateId: template?.id ?? null,
            status: 'IN_PROGRESS',
            startedAt: now,
            ownerUserId: ctx.userId,
          },
        })

        if (template?.steps.length) {
          await tx.onboardingStepProgress.createMany({
            data: template.steps.map((step) => ({
              processId: onboardingProcess.id,
              templateStepId: step.id,
              title: step.title,
              stepType: step.stepType,
              isRequired: step.isRequired,
              sortOrder: step.sortOrder,
              dueDate: step.dueDaysFromStart != null
                ? new Date(now.getTime() + step.dueDaysFromStart * 24 * 60 * 60 * 1000)
                : null,
              metadata: step.metadata ?? undefined,
            })),
          })
        }
      }
    }

    const company = await tx.company.findUnique({
      where: { id: ctx.companyId },
      select: { name: true },
    })
    const templates = await tx.$queryRaw<Array<{
      type: 'INTERVIEW' | 'REJECTION' | 'OFFER'
      subject: string
      body: string
    }>`
      SELECT "type", "subject", "body"
      FROM "recruitment_email_templates"
      WHERE "companyId" = ${ctx.companyId}
        AND "isActive" = true
    `

    return { application, companyName: company?.name ?? 'Onclock', templates }
  })
  const templateType =
    result.application.stage === 'REJECTED'
      ? 'REJECTION'
      : result.application.stage === 'OFFER'
        ? 'OFFER'
        : result.application.stage === 'INTERVIEW' || result.application.stage === 'FINAL_INTERVIEW'
          ? 'INTERVIEW'
          : null

  if (templateType && result.application.email) {
    const tpl = result.templates.find((item) => item.type === templateType)
    if (tpl) {
      const replacements: Record<string, string> = {
        firstName: result.application.firstName,
        lastName: result.application.lastName,
        jobTitle: (await prisma.jobPost.findUnique({
          where: { id: result.application.jobPostId },
          select: { title: true },
        }))?.title ?? 'the role',
        companyName: result.companyName,
      }
      const applyVars = (value: string) =>
        value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => replacements[key] ?? '')

      sendRecruitmentStageEmail({
        companyId: ctx.companyId,
        to: result.application.email,
        subject: applyVars(tpl.subject),
        body: applyVars(tpl.body),
      }).catch(() => null)
    }
  }

  return NextResponse.json({ application: result.application })
}
