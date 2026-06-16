import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2),
  code: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const includeEmployees = searchParams.get('includeEmployees') === '1'

  const departments = await prisma.department.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    include: {
      _count: { select: { employees: true } },
      children: { select: { id: true, name: true } },
      ...(includeEmployees
        ? {
            employees: {
              where: { isActive: true },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                photoUrl: true,
                employeeNo: true,
                position: { select: { title: true } },
              },
              orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            },
          }
        : {}),
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ departments })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const dept = await prisma.department.create({
    data: {
      companyId: ctx.companyId,
      name: parsed.data.name,
      code: parsed.data.code ?? null,
      parentId: parsed.data.parentId ?? null,
    },
  })

  return NextResponse.json(dept, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const { id, ...rest } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.department.updateMany({
    where: { id, companyId: ctx.companyId },
    data: rest,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Soft delete
  await prisma.department.updateMany({
    where: { id, companyId: ctx.companyId },
    data: { isActive: false },
  })

  return NextResponse.json({ ok: true })
}
