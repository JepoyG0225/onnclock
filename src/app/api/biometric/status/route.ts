import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const [employee, company] = await Promise.all([
    prisma.employee.findFirst({
      where: { userId: ctx.userId, companyId: ctx.companyId },
      select: { biometricCredential: true, fingerprintExempt: true },
    }),
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { fingerprintRequired: true },
    }),
  ])

  return NextResponse.json({
    enrolled: !!employee?.biometricCredential,
    required: (company?.fingerprintRequired ?? true) && !employee?.fingerprintExempt,
  })
}
