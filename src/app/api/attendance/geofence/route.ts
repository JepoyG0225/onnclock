import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// Returns geofence config for the employee's company (read-only, no sensitive data)
export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { geofenceEnabled: true, geofenceLat: true, geofenceLng: true, geofenceRadiusMeters: true },
  })

  if (!company) return NextResponse.json({ enabled: false })

  return NextResponse.json({
    enabled: company.geofenceEnabled ?? false,
    lat: company.geofenceLat ?? null,
    lng: company.geofenceLng ?? null,
    radiusMeters: company.geofenceRadiusMeters ?? null,
    configured: company.geofenceLat != null && company.geofenceLng != null && company.geofenceRadiusMeters != null,
  })
}
