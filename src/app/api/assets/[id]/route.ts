/**
 * PATCH /api/assets/[id] — edit asset fields
 * DELETE /api/assets/[id] — delete asset (cascades assignment history)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { requireHrisProOrTrialApi } from '@/lib/hris-pro'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN']

const patchSchema = z.object({
  assetTag: z.string().optional().nullable(),
  category: z.string().optional(),
  name: z.string().optional(),
  serialNumber: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  purchaseCost: z.coerce.number().optional().nullable(),
  warrantyUntil: z.string().optional().nullable(),
  status: z.enum(['AVAILABLE', 'ASSIGNED', 'IN_REPAIR', 'RETIRED', 'LOST']).optional(),
  notes: z.string().optional().nullable(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  const gate = await requireHrisProOrTrialApi(companyId)
  if (gate) return gate
  const { id } = await params

  const existing = await prisma.companyAsset.findFirst({ where: { id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const d = parsed.data
  const asset = await prisma.companyAsset.update({
    where: { id },
    data: {
      ...(d.assetTag !== undefined ? { assetTag: d.assetTag } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.serialNumber !== undefined ? { serialNumber: d.serialNumber } : {}),
      ...(d.purchaseDate !== undefined ? { purchaseDate: d.purchaseDate ? new Date(d.purchaseDate) : null } : {}),
      ...(d.purchaseCost !== undefined ? { purchaseCost: d.purchaseCost } : {}),
      ...(d.warrantyUntil !== undefined ? { warrantyUntil: d.warrantyUntil ? new Date(d.warrantyUntil) : null } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    },
  })
  return NextResponse.json({ asset })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  const gate = await requireHrisProOrTrialApi(companyId)
  if (gate) return gate
  const { id } = await params

  const existing = await prisma.companyAsset.findFirst({ where: { id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  await prisma.companyAsset.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
