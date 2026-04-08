import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
    select: { faceEmbedding: true, faceSetupAt: true },
  })

  return NextResponse.json({
    hasFace: !!employee?.faceEmbedding,
    faceSetupAt: employee?.faceSetupAt ?? null,
  })
}
