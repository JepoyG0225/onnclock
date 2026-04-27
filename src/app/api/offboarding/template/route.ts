import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { z } from 'zod'
const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const createSchema = z.object({
  category: z.string().min(1).max(100),
  title: z.string().min(1).max(255),
  description: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().default(0),
})

export async function GET(_req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const sub = await getCompanySubscription(ctx.companyId)
  if (!hasHrisProFeature(sub.pricePerSeat)) {
    return NextResponse.json({ error: 'Offboarding requires a Pro subscription.' }, { status: 403 })
  }

  const items = await prisma.offboardingTemplateItem.findMany({
    where: { companyId: ctx.companyId },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const sub = await getCompanySubscription(ctx.companyId)
  if (!hasHrisProFeature(sub.pricePerSeat)) {
    return NextResponse.json({ error: 'Offboarding requires a Pro subscription.' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { category, title, description, sortOrder } = parsed.data

  const item = await prisma.offboardingTemplateItem.create({
    data: {
      companyId: ctx.companyId,
      category: category.trim(),
      title: title.trim(),
      description: description?.trim() ?? null,
      sortOrder,
    },
  })

  return NextResponse.json({ item }, { status: 201 })
}
