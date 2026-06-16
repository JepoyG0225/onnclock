import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// GET /api/employees/[id]/face — returns face setup status + photo for admin view
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { faceSetupAt: true, faceSetupPhoto: true, faceEmbeddingModel: true, faceEmbedding: true },
  })
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    hasFace: !!employee.faceEmbedding,
    faceSetupAt: employee.faceSetupAt,
    faceSetupPhoto: employee.faceSetupPhoto ?? null,
    faceEmbeddingModel: employee.faceEmbeddingModel ?? null,
  })
}

// DELETE /api/employees/[id]/face — resets face data (admin only)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      faceEmbedding: Prisma.JsonNull,
      faceEmbeddingModel: null,
      faceSetupAt: null,
      faceConsentAt: null,
      faceSetupPhoto: null,
    },
  })

  return NextResponse.json({ success: true })
}
