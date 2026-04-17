import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const updateIncomeTypeSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  code: z.string().max(30).optional().nullable(),
  mode: z.enum(['FIXED', 'VARIABLE']).optional(),
  defaultAmount: z.coerce.number().min(0).optional(),
  isTaxable: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = updateIncomeTypeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const existing = await prisma.incomeType.findFirst({ where: { id, companyId: ctx.companyId } })
  if (!existing) return NextResponse.json({ error: 'Income type not found' }, { status: 404 })

  const payload = parsed.data
  const mode = payload.mode ?? existing.mode

  try {
    const incomeType = await prisma.incomeType.update({
      where: { id },
      data: {
        ...(payload.name != null ? { name: payload.name.trim() } : {}),
        ...(payload.code !== undefined ? { code: payload.code?.trim() || null } : {}),
        ...(payload.mode ? { mode: payload.mode } : {}),
        ...(payload.defaultAmount !== undefined
          ? { defaultAmount: mode === 'FIXED' ? payload.defaultAmount : 0 }
          : mode === 'VARIABLE'
            ? { defaultAmount: 0 }
            : {}),
        ...(payload.isTaxable != null ? { isTaxable: payload.isTaxable } : {}),
        ...(payload.isActive != null ? { isActive: payload.isActive } : {}),
      },
    })

    return NextResponse.json({ incomeType })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Income type name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update income type' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const existing = await prisma.incomeType.findFirst({ where: { id, companyId: ctx.companyId } })
  if (!existing) return NextResponse.json({ error: 'Income type not found' }, { status: 404 })

  await prisma.incomeType.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ success: true })
}
