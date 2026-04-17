import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// Returns geofence config for the employee's company (read-only, no sensitive data)
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const [employee, company] = await Promise.all([
    prisma.employee.findFirst({
      where: { userId: ctx.userId, companyId: ctx.companyId },
      select: { geofenceExempt: true },
    }),
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { geofenceEnabled: true, geofenceLat: true, geofenceLng: true, geofenceRadiusMeters: true },
    }),
  ])

  if (!company) return NextResponse.json({ enabled: false })
  const geofenceEnabled = (company.geofenceEnabled ?? false) && !employee?.geofenceExempt

  return NextResponse.json({
    enabled: geofenceEnabled,
    lat: company.geofenceLat ?? null,
    lng: company.geofenceLng ?? null,
    radiusMeters: company.geofenceRadiusMeters ?? null,
    configured:
      geofenceEnabled &&
      company.geofenceLat != null &&
      company.geofenceLng != null &&
      company.geofenceRadiusMeters != null,
  })
}
