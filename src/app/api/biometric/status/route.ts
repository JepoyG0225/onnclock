import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employeeId = await resolvePortalEmployeeId(ctx)

  const [employee, company] = await Promise.all([
    employeeId
      ? prisma.employee.findUnique({
          where: { id: employeeId },
          select: { biometricCredential: true, fingerprintExempt: true },
        })
      : Promise.resolve(null),
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { fingerprintRequired: true },
    }),
  ])

  return NextResponse.json(
    {
      enrolled: !!employee?.biometricCredential,
      required: (company?.fingerprintRequired ?? true) && !employee?.fingerprintExempt,
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
