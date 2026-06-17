import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'

function stripLargePrivateFields<T extends object>(employee: T) {
  const safeEmployee = { ...employee } as T & {
    faceEmbedding?: unknown
    faceSetupPhoto?: unknown
    biometricCredential?: unknown
    biometricChallenge?: unknown
  }

  delete safeEmployee.faceEmbedding
  delete safeEmployee.faceSetupPhoto
  delete safeEmployee.biometricCredential
  delete safeEmployee.biometricChallenge
  // signatureDataUrl IS exposed here on purpose — the employee owns it and
  // needs to see / re-capture it from their profile page.
  return safeEmployee
}

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employeeId = await resolvePortalEmployeeId(ctx)

  const [employee, company] = await Promise.all([
    employeeId ? prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        department: { select: { name: true } },
        position: { select: { title: true } },
        workSchedule: { select: { id: true, name: true, requireSelfieOnClockIn: true } },
      },
    }) : Promise.resolve(null),
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { selfieRequired: true },
    }),
  ])

  if (!employee) return NextResponse.json({ employee: null }, { status: 404 })

  const selfieRequired =
    !employee.selfieExempt &&
    ((company?.selfieRequired ?? false) || !!employee.workSchedule?.requireSelfieOnClockIn)

  return NextResponse.json({
    employee: {
      ...stripLargePrivateFields(employee),
      selfieRequired,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  // Partial-update safety: only touch fields the profile form actually sent.
  //   n(undefined) → undefined → Prisma skips (preserve existing value)
  //   n('')        → null       → employee explicitly cleared the field
  // Previously every field used `?? null`, so any field omitted by the portal
  // form (or sent as undefined) silently wiped the stored value.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = (v: any) => (v === undefined ? undefined : (v === '' ? null : v))
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const data = {
    firstName: body.firstName,
    middleName: n(body.middleName),
    lastName: body.lastName,
    suffix: n(body.suffix),
    gender: body.gender,
    ...(body.birthDate ? { birthDate: new Date(body.birthDate) } : {}),
    civilStatus: body.civilStatus,
    nationality: body.nationality,
    personalEmail: n(body.personalEmail),
    mobileNo: n(body.mobileNo),
    sssNo: n(body.sssNo),
    philhealthNo: n(body.philhealthNo),
    pagibigNo: n(body.pagibigNo),
    tinNo: n(body.tinNo),
  }

  const employeeId = await resolvePortalEmployeeId(ctx)
  const existing = employeeId
    ? await prisma.employee.findUnique({ where: { id: employeeId } })
    : null
  if (!existing) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const updated = await prisma.employee.update({
    where: { id: existing.id },
    data,
    include: {
      department: { select: { name: true } },
      position: { select: { title: true } },
      workSchedule: { select: { id: true, name: true, requireSelfieOnClockIn: true } },
    },
  })

  return NextResponse.json({ employee: stripLargePrivateFields(updated) })
}
