import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

// Minimum required fields to create an employee from an application.
// Name / email / phone / address are pre-filled from the application.
const hireSchema = z.object({
  employeeNo: z.string().trim().min(1),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  basicSalary: z.number().positive(),
  employmentStatus: z
    .enum(['PROBATIONARY', 'REGULAR', 'CONTRACTUAL', 'PROJECT_BASED', 'PART_TIME'])
    .default('PROBATIONARY'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTUAL']).default('FULL_TIME'),
  departmentId: z.string().optional().nullable(),
  positionId: z.string().optional().nullable(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { applicationId } = await params
  const body = await req.json().catch(() => null)
  const parsed = hireSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Load the application
  const application = await prisma.jobApplication.findFirst({
    where: { id: applicationId, companyId: ctx.companyId },
    select: {
      id: true,
      stage: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      currentAddress: true,
      hiredEmployeeId: true,
    },
  })

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  if (application.hiredEmployeeId) {
    return NextResponse.json({ error: 'This applicant has already been converted to an employee.' }, { status: 409 })
  }

  if (['REJECTED', 'WITHDRAWN'].includes(application.stage)) {
    return NextResponse.json({ error: 'Cannot hire a rejected or withdrawn applicant.' }, { status: 400 })
  }

  // Ensure employeeNo is unique within the company
  const existingNo = await prisma.employee.findFirst({
    where: { companyId: ctx.companyId, employeeNo: parsed.data.employeeNo },
    select: { id: true },
  })
  if (existingNo) {
    return NextResponse.json({ error: `Employee number ${parsed.data.employeeNo} is already taken.` }, { status: 409 })
  }

  const {
    employeeNo, gender, birthDate, hireDate, basicSalary,
    employmentStatus, employmentType, departmentId, positionId,
  } = parsed.data

  const now = new Date()

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the employee record pre-filled from application data
    const employee = await tx.employee.create({
      data: {
        companyId: ctx.companyId,
        employeeNo,
        firstName: application.firstName,
        lastName: application.lastName,
        personalEmail: application.email,
        mobileNo: application.phone ?? undefined,
        presentAddress: application.currentAddress ?? undefined,
        gender,
        birthDate: new Date(birthDate),
        hireDate: new Date(hireDate),
        basicSalary,
        employmentStatus,
        employmentType,
        departmentId: departmentId ?? undefined,
        positionId: positionId ?? undefined,
      },
      select: {
        id: true,
        employeeNo: true,
        firstName: true,
        lastName: true,
      },
    })

    // 2. Mark the application as HIRED and link the employee
    const updatedApp = await tx.jobApplication.update({
      where: { id: applicationId },
      data: {
        stage: 'HIRED',
        hiredAt: now,
        hiredEmployeeId: employee.id,
        lastStageUpdatedAt: now,
        reviewedByUserId: ctx.userId,
      },
    })

    // 3. Auto-start onboarding with the default template (if one exists)
    const existingProcess = await tx.onboardingProcess.findFirst({
      where: { applicationId: updatedApp.id },
      select: { id: true },
    })

    if (!existingProcess) {
      const template = await tx.onboardingTemplate.findFirst({
        where: { companyId: ctx.companyId, isActive: true, isDefault: true },
        include: {
          steps: { orderBy: [{ sortOrder: 'asc' }] },
        },
      })

      const process = await tx.onboardingProcess.create({
        data: {
          companyId: ctx.companyId,
          employeeId: employee.id,
          applicationId: updatedApp.id,
          templateId: template?.id ?? null,
          status: 'IN_PROGRESS',
          startedAt: new Date(hireDate),
          ownerUserId: ctx.userId,
        },
      })

      if (template?.steps.length) {
        const start = new Date(hireDate)
        await tx.onboardingStepProgress.createMany({
          data: template.steps.map((step) => ({
            processId: process.id,
            templateStepId: step.id,
            title: step.title,
            stepType: step.stepType,
            isRequired: step.isRequired,
            sortOrder: step.sortOrder,
            dueDate:
              step.dueDaysFromStart != null
                ? new Date(start.getTime() + step.dueDaysFromStart * 24 * 60 * 60 * 1000)
                : null,
            metadata: step.metadata ?? undefined,
          })),
        })
      }
    }

    return { employee, application: updatedApp }
  })

  return NextResponse.json({ employee: result.employee, application: result.application }, { status: 201 })
}
