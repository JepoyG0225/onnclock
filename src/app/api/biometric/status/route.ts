import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { resolvePortalEmployeeId } from '@/lib/portal-employee'

export async function GET() {
  try {
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
  } catch (err) {
    // The global Prisma timeout in lib/prisma.ts (5s default) prevents
    // a hung query from dragging the function out — but we still want a
    // structured 500 instead of Vercel's empty-body crash response so
    // the client can degrade gracefully. Falling back to a "not
    // enrolled, not required" response keeps the portal usable while
    // the DB sorts itself out.
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[biometric/status] handler crash:', msg)
    return NextResponse.json(
      { enrolled: false, required: false, error: msg },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
