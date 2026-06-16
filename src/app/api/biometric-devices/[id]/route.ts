/**
 * PATCH /api/biometric-devices/[id]
 *   Body: { action: 'REGENERATE_PAIR_CODE' | 'REVOKE' | 'REACTIVATE' | 'RENAME', name?, location? }
 * DELETE /api/biometric-devices/[id]
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { generatePairCode } from '@/lib/biometric-device-auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchSchema = z.object({
  action:   z.enum(['REGENERATE_PAIR_CODE', 'REVOKE', 'REACTIVATE', 'RENAME']),
  name:     z.string().trim().min(1).max(120).optional(),
  location: z.string().trim().max(200).optional().nullable(),
})

const PAIR_CODE_TTL_MINUTES = 15

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const gate = requireAdminOrHR(ctx)
  if (gate) return gate
  const { id } = await params

  const device = await prisma.biometricDevice.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true, status: true },
  })
  if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  if (parsed.data.action === 'REGENERATE_PAIR_CODE') {
    let pairCode = generatePairCode()
    for (let i = 0; i < 4; i++) {
      const exists = await prisma.biometricDevice.findFirst({ where: { pairCode, NOT: { id } } })
      if (!exists) break
      pairCode = generatePairCode()
    }
    const pairCodeExpiresAt = new Date(Date.now() + PAIR_CODE_TTL_MINUTES * 60_000)
    const updated = await prisma.biometricDevice.update({
      where: { id },
      data: {
        pairCode,
        pairCodeExpiresAt,
        // Re-pairing also clears the previous token
        tokenHash: null,
        status: 'PENDING_PAIRING',
        pairedAt: null,
      },
    })
    return NextResponse.json({ device: updated, pairCode, pairCodeExpiresAt })
  }

  if (parsed.data.action === 'REVOKE') {
    const updated = await prisma.biometricDevice.update({
      where: { id },
      data: { status: 'REVOKED', tokenHash: null, pairCode: null, pairCodeExpiresAt: null },
    })
    return NextResponse.json({ device: updated })
  }

  if (parsed.data.action === 'REACTIVATE') {
    if (device.status !== 'DISABLED') {
      return NextResponse.json({ error: 'Only disabled devices can be reactivated' }, { status: 400 })
    }
    const updated = await prisma.biometricDevice.update({
      where: { id },
      data: { status: 'ACTIVE' },
    })
    return NextResponse.json({ device: updated })
  }

  if (parsed.data.action === 'RENAME') {
    const updated = await prisma.biometricDevice.update({
      where: { id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.location !== undefined ? { location: parsed.data.location } : {}),
      },
    })
    return NextResponse.json({ device: updated })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const gate = requireAdminOrHR(ctx)
  if (gate) return gate
  const { id } = await params

  const device = await prisma.biometricDevice.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

  await prisma.biometricDevice.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
