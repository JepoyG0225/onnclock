import { faceBetaAvailable } from '@/lib/face/availability'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!(await faceBetaAvailable(ctx.companyId))) return NextResponse.json({ available: false, hasFace: false, faceSetupAt: null })

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
    select: { faceEmbedding: true, faceSetupAt: true },
  })

  return NextResponse.json({
    available: true,
    hasFace: !!employee?.faceEmbedding,
    faceSetupAt: employee?.faceSetupAt ?? null,
  })
}
