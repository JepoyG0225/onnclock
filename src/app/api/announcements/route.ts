import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN']

const createSchema = z.object({
  title:     z.string().min(1),
  content:   z.string().min(1),
  expiresAt: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const isActiveParam = searchParams.get('isActive')

  // Default: only active announcements; pass isActive=all or isActive=false to get all/inactive
  let isActiveFilter: boolean | undefined = true
  if (isActiveParam === 'all')   isActiveFilter = undefined
  if (isActiveParam === 'false') isActiveFilter = false

  const announcements = await prisma.announcement.findMany({
    where: {
      companyId: ctx.companyId,
      ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
    },
    orderBy: { publishedAt: 'desc' },
  })

  return NextResponse.json({ announcements })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { title, content, expiresAt } = parsed.data

  const announcement = await prisma.announcement.create({
    data: {
      companyId:   ctx.companyId,
      title,
      content,
      isActive:    true,
      publishedAt: new Date(),
      expiresAt:   expiresAt ? new Date(expiresAt) : null,
      createdBy:   ctx.userId,
    },
  })

  return NextResponse.json({ announcement }, { status: 201 })
}
