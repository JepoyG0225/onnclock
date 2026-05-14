/**
 * HR-facing biometric device management.
 *
 * GET  /api/biometric-devices            List all devices for the company
 * POST /api/biometric-devices            Generate a new pair code for a device
 *   Body: { name: string, location?: string }
 *   Returns: { device, pairCode, pairCodeExpiresAt }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { generatePairCode } from '@/lib/biometric-device-auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(200).optional().nullable(),
})

const PAIR_CODE_TTL_MINUTES = 15

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const gate = requireAdminOrHR(ctx)
  if (gate) return gate

  const devices = await prisma.biometricDevice.findMany({
    where: { companyId: ctx.companyId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      location: true,
      serialNumber: true,
      status: true,
      pairCode: true,
      pairCodeExpiresAt: true,
      pairedAt: true,
      lastSeenAt: true,
      firmwareVersion: true,
      ipAddress: true,
      createdAt: true,
      _count: { select: { events: true, enrollments: true } },
    },
  })

  // Mask pair codes after expiry so the UI doesn't display stale codes
  const now = Date.now()
  const masked = devices.map((d) => ({
    ...d,
    pairCode: d.pairCodeExpiresAt && d.pairCodeExpiresAt.getTime() > now ? d.pairCode : null,
  }))

  return NextResponse.json({ devices: masked })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const gate = requireAdminOrHR(ctx)
  if (gate) return gate

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  // Generate a unique pair code (loop on the rare collision)
  let pairCode = generatePairCode()
  for (let i = 0; i < 4; i++) {
    const exists = await prisma.biometricDevice.findFirst({ where: { pairCode } })
    if (!exists) break
    pairCode = generatePairCode()
  }
  const pairCodeExpiresAt = new Date(Date.now() + PAIR_CODE_TTL_MINUTES * 60_000)

  const device = await prisma.biometricDevice.create({
    data: {
      companyId:         ctx.companyId,
      name:              parsed.data.name,
      location:          parsed.data.location ?? null,
      pairCode,
      pairCodeExpiresAt,
      status:            'PENDING_PAIRING',
      createdByUserId:   ctx.userId,
    },
    select: { id: true, name: true, location: true, status: true, pairCode: true, pairCodeExpiresAt: true, createdAt: true },
  })

  return NextResponse.json({ device, pairCode, pairCodeExpiresAt }, { status: 201 })
}
