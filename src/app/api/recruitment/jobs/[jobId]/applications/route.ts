import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { jobId } = await params
  const { searchParams } = new URL(req.url)
  const stage = searchParams.get('stage')
  const q = searchParams.get('q')?.trim() ?? ''

  const job = await prisma.jobPost.findFirst({
    where: { id: jobId, companyId: ctx.companyId },
    select: { id: true },
  })

  if (!job) return NextResponse.json({ error: 'Job post not found' }, { status: 404 })

  const applications = await prisma.jobApplication.findMany({
    where: {
      companyId: ctx.companyId,
      jobPostId: jobId,
      ...(stage ? { stage: stage as 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'FINAL_INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED' | 'WITHDRAWN' } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ appliedAt: 'desc' }],
  })

  return NextResponse.json({ applications })
}
