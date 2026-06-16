import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  label: z.string().min(2).max(120),
  type: z.enum(['GCASH', 'BANK_TRANSFER', 'E_WALLET', 'OTHER']),
  bankName: z.string().max(120).optional().nullable(),
  accountName: z.string().max(120).optional().nullable(),
  accountNumber: z.string().max(120).optional().nullable(),
  instructions: z.string().max(500).optional().nullable(),
  qrImageUrl: z.string().url().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const { id } = await params
  const body = updateSchema.parse(await req.json())

  const method = await prisma.paymentMethod.update({
    where: { id },
    data: body,
  })

  return NextResponse.json({ method })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const { id } = await params
  await prisma.paymentMethod.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

