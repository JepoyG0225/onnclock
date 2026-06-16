/**
 * GET  /api/assets — list company assets (with optional category/status filters)
 * POST /api/assets — create a new asset
 *
 * HR-roles only. Both endpoints company-scoped via auth context.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { requireHrisProOrTrialApi } from '@/lib/hris-pro'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN']

const createSchema = z.object({
  assetTag: z.string().optional().nullable(),
  category: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  serialNumber: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  purchaseCost: z.coerce.number().optional().nullable(),
  warrantyUntil: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  const gate = await requireHrisProOrTrialApi(companyId)
  if (gate) return gate

  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || undefined
  const category = sp.get('category') || undefined

  const assets = await prisma.companyAsset.findMany({
    where: {
      companyId,
      ...(status ? { status: status as 'AVAILABLE' | 'ASSIGNED' | 'IN_REPAIR' | 'RETIRED' | 'LOST' } : {}),
      ...(category ? { category } : {}),
    },
    include: {
      assignments: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          assignedAt: true,
          employee: { select: { id: true, firstName: true, lastName: true, employeeNo: true } },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { category: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({ assets })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  const gate = await requireHrisProOrTrialApi(companyId)
  if (gate) return gate

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const d = parsed.data

  const asset = await prisma.companyAsset.create({
    data: {
      companyId,
      assetTag: d.assetTag ?? null,
      category: d.category,
      name: d.name,
      serialNumber: d.serialNumber ?? null,
      purchaseDate: d.purchaseDate ? new Date(d.purchaseDate) : null,
      purchaseCost: d.purchaseCost ?? null,
      warrantyUntil: d.warrantyUntil ? new Date(d.warrantyUntil) : null,
      notes: d.notes ?? null,
    },
  })
  return NextResponse.json({ asset }, { status: 201 })
}
