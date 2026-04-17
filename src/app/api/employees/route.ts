import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createEmployeeSchema = z.object({
  employeeNo: z.string().min(1),
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  suffix: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  birthDate: z.string(),
  birthPlace: z.string().optional(),
  civilStatus: z.enum(['SINGLE', 'MARRIED', 'WIDOWED', 'LEGALLY_SEPARATED']).default('SINGLE'),
  nationality: z.string().default('Filipino'),
  religion: z.string().optional(),
  personalEmail: z.string().email().optional().or(z.literal('')),
  workEmail: z.string().email().optional().or(z.literal('')),
  mobileNo: z.string().optional(),
  phoneNo: z.string().optional(),
  presentAddress: z.string().optional(),
  permanentAddress: z.string().optional(),
  sssNo: z.string().optional(),
  tinNo: z.string().optional(),
  philhealthNo: z.string().optional(),
  pagibigNo: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  departmentId: z.string().optional(),
  positionId: z.string().optional(),
  directManagerId: z.string().optional(),
  employmentStatus: z.enum(['PROBATIONARY', 'REGULAR', 'CONTRACTUAL', 'PROJECT_BASED', 'PART_TIME', 'RESIGNED', 'TERMINATED', 'RETIRED']).default('PROBATIONARY'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTUAL']).default('FULL_TIME'),
  hireDate: z.string(),
  regularizationDate: z.string().optional(),
  rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).default('MONTHLY'),
  basicSalary: z.number().positive(),
  dailyRate: z.number().optional(),
  hourlyRate: z.number().optional(),
  payFrequency: z.enum(['SEMI_MONTHLY', 'MONTHLY', 'WEEKLY', 'DAILY']).default('SEMI_MONTHLY'),
  workScheduleId: z.string().optional(),
  dayOffDays: z.array(z.number().int().min(0).max(6)).optional(),
  bankName: z.string().optional(),
  bankAccountNo: z.string().optional(),
  isExemptFromTax: z.boolean().default(false),
  isMinimumWageEarner: z.boolean().default(false),
  fingerprintExempt: z.boolean().default(false),
  geofenceExempt: z.boolean().default(false),
  selfieExempt: z.boolean().default(false),
  notes: z.string().optional(),
})

function deriveWorkDaysFromDayOffs(dayOffDays: number[] | undefined): number[] {
  const fullWeek = [0, 1, 2, 3, 4, 5, 6]
  const off = new Set((dayOffDays ?? []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))
  const workDays = fullWeek.filter(d => !off.has(d))
  return workDays.length > 0 ? workDays : [1, 2, 3, 4, 5]
}

async function resolveCustomScheduleId(params: {
  companyId: string
  employeeNo: string
  baseScheduleId?: string
  dayOffDays?: number[]
}) {
  if (!params.dayOffDays) return params.baseScheduleId ?? null

  const baseSchedule = params.baseScheduleId
    ? await prisma.workSchedule.findFirst({
        where: { id: params.baseScheduleId, companyId: params.companyId },
      })
    : null

  const workDays = deriveWorkDaysFromDayOffs(params.dayOffDays)
  const customName = `${params.employeeNo} - Custom Day Offs`
  const existing = await prisma.workSchedule.findFirst({
    where: { companyId: params.companyId, name: customName, isActive: true },
  })

  const payload = {
    scheduleType: baseSchedule?.scheduleType ?? 'FIXED',
    requireSelfieOnClockIn: baseSchedule?.requireSelfieOnClockIn ?? false,
    workDays,
    timeIn: baseSchedule?.timeIn ?? '08:00',
    timeOut: baseSchedule?.timeOut ?? '17:00',
    breakMinutes: Number(baseSchedule?.breakMinutes ?? 60),
    workHoursPerDay: baseSchedule?.workHoursPerDay ?? 8,
    workDaysPerWeek: workDays.length,
    isActive: true,
  }

  if (existing) {
    const updated = await prisma.workSchedule.update({
      where: { id: existing.id },
      data: payload,
    })
    return updated.id
  }

  const created = await prisma.workSchedule.create({
    data: {
      companyId: params.companyId,
      name: customName,
      ...payload,
    },
  })
  return created.id
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const org = searchParams.get('org') === '1'
  const unlinked = searchParams.get('unlinked') === '1'
  const search = searchParams.get('search') || ''
  const departmentId = searchParams.get('departmentId') || undefined
  const status = searchParams.get('status') || undefined
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')

  const where: Record<string, unknown> = {
    companyId,
    ...(departmentId && { departmentId }),
    ...(status && { employmentStatus: status }),
    ...(search && {
      OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { employeeNo: { contains: search } },
        { workEmail: { contains: search } },
      ],
    }),
  }

  if (org) {
    const employees = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeNo: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        directManagerId: true,
        department: { select: { name: true } },
        position: { select: { title: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    return NextResponse.json({ employees, total: employees.length, page: 1, limit: employees.length })
  }

  if (unlinked) {
    const employees = await prisma.employee.findMany({
      where: { ...where, userId: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNo: true,
        workEmail: true,
        personalEmail: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    return NextResponse.json({ employees })
  }

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        position: { select: { id: true, title: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ])

  return NextResponse.json({ employees, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = createEmployeeSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data
  const { dayOffDays, ...employeeData } = data

  // Auto-compute daily and hourly rates if not provided
  const dailyRate = employeeData.dailyRate ?? (employeeData.rateType === 'MONTHLY' ? employeeData.basicSalary / 22 : employeeData.basicSalary)
  const hourlyRate = data.hourlyRate ?? dailyRate / 8

  try {
    const resolvedWorkScheduleId = await resolveCustomScheduleId({
      companyId: ctx.companyId,
      employeeNo: employeeData.employeeNo,
      baseScheduleId: employeeData.workScheduleId,
      dayOffDays,
    })

    const employee = await prisma.employee.create({
      data: {
        companyId: ctx.companyId,
        ...employeeData,
        workScheduleId: resolvedWorkScheduleId,
        birthDate: new Date(employeeData.birthDate),
        hireDate: new Date(employeeData.hireDate),
        regularizationDate: employeeData.regularizationDate ? new Date(employeeData.regularizationDate) : null,
        personalEmail: employeeData.personalEmail || null,
        workEmail: employeeData.workEmail || null,
        dailyRate,
        hourlyRate,
        directManagerId: employeeData.directManagerId || null,
      },
    })

    // Initialize leave balances for current year
    const currentYear = new Date().getFullYear()
    const leaveTypes = await prisma.leaveType.findMany({
      where: { companyId: ctx.companyId, isActive: true },
    })

    const eligibleLeaveTypes = leaveTypes.filter(lt => !lt.genderRestriction || lt.genderRestriction === employeeData.gender)

    await prisma.leaveBalance.createMany({
      data: eligibleLeaveTypes.map(lt => ({
        employeeId: employee.id,
        leaveTypeId: lt.id,
        year: currentYear,
        entitled: lt.daysEntitled,
        updatedAt: new Date(),
      })),
      skipDuplicates: true,
    })

    return NextResponse.json({ employee }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Employee number already exists' }, { status: 409 })
    }
    console.error('Employee creation error:', error)
    return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 })
  }
}
