import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const createIncomeTypeSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().max(30).optional(),
  mode: z.enum(['FIXED', 'VARIABLE']),
  defaultAmount: z.coerce.number().min(0).optional().default(0),
  isTaxable: z.boolean().default(true),
  isActive: z.boolean().optional().default(true),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const includeInactive = searchParams.get('includeInactive') === '1'

  const incomeTypes = await prisma.incomeType.findMany({
    where: {
      companyId: ctx.companyId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })

  return NextResponse.json({ incomeTypes })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = createIncomeTypeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data

  try {
    const incomeType = await prisma.incomeType.create({
      data: {
        companyId: ctx.companyId,
        name: data.name.trim(),
        code: data.code?.trim() || null,
        mode: data.mode,
        defaultAmount: data.mode === 'FIXED' ? data.defaultAmount : 0,
        isTaxable: data.isTaxable,
        isActive: data.isActive,
      },
    })
    return NextResponse.json({ incomeType }, { status: 201 })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Income type name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create income type' }, { status: 500 })
  }
}
