import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({ status: z.enum(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']), completedAt: z.string().optional(), score: z.coerce.number().min(0).max(100).optional(), notes: z.string().optional() })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(ctx.role)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid completion details.' }, { status: 422 })
  const { id } = await params
  const row = await prisma.learningEnrollment.findFirst({ where: { id, course: { companyId: ctx.companyId } }, select: { id: true } })
  if (!row) return NextResponse.json({ error: 'Enrollment not found.' }, { status: 404 })
  const data = parsed.data
  const enrollment = await prisma.learningEnrollment.update({ where: { id }, data: { status: data.status, completedAt: data.status === 'COMPLETED' ? new Date(data.completedAt || new Date()) : null, score: data.score, notes: data.notes } })
  return NextResponse.json({ enrollment })
}
