import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

const updateJobSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(5).optional(),
  requirements: z.array(z.string().min(1)).optional(),
  benefits: z.array(z.string().min(1)).optional(),
  department: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  workSetup: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  salaryMin: z.number().nonnegative().nullable().optional(),
  salaryMax: z.number().nonnegative().nullable().optional(),
  visibility: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(),
  closesAt: z.string().datetime().nullable().optional(),
  slug: z.string().optional(),
})

const deleteJobSchema = z.object({
  confirmText: z.string().trim().min(1),
})

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || `job-${Date.now()}`
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { jobId } = await params
  const job = await prisma.jobPost.findFirst({
    where: { id: jobId, companyId: ctx.companyId },
    include: {
      applications: {
        orderBy: [{ appliedAt: 'desc' }],
        take: 100,
      },
      _count: { select: { applications: true } },
    },
  })

  if (!job) return NextResponse.json({ error: 'Job post not found' }, { status: 404 })
  return NextResponse.json({ job })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { jobId } = await params
  const body = await req.json().catch(() => null)
  const parsed = updateJobSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const existing = await prisma.jobPost.findFirst({
    where: { id: jobId, companyId: ctx.companyId },
    select: { id: true, visibility: true },
  })
  if (!existing) return NextResponse.json({ error: 'Job post not found' }, { status: 404 })

  const nextVisibility = parsed.data.visibility
  const shouldSetPublishedAt = nextVisibility === 'PUBLISHED' && existing.visibility !== 'PUBLISHED'

  const updates: Record<string, unknown> = {
    ...(parsed.data.title ? { title: parsed.data.title.trim() } : {}),
    ...(parsed.data.description ? { description: parsed.data.description.trim() } : {}),
    ...(parsed.data.requirements !== undefined ? { requirements: parsed.data.requirements } : {}),
    ...(parsed.data.benefits !== undefined ? { benefits: parsed.data.benefits } : {}),
    ...(parsed.data.department !== undefined ? { department: parsed.data.department?.trim() || null } : {}),
    ...(parsed.data.employmentType !== undefined ? { employmentType: parsed.data.employmentType?.trim() || null } : {}),
    ...(parsed.data.workSetup !== undefined ? { workSetup: parsed.data.workSetup?.trim() || null } : {}),
    ...(parsed.data.location !== undefined ? { location: parsed.data.location?.trim() || null } : {}),
    ...(parsed.data.salaryMin !== undefined ? { salaryMin: parsed.data.salaryMin } : {}),
    ...(parsed.data.salaryMax !== undefined ? { salaryMax: parsed.data.salaryMax } : {}),
    ...(parsed.data.visibility ? { visibility: parsed.data.visibility } : {}),
    ...(parsed.data.closesAt !== undefined
      ? { closesAt: parsed.data.closesAt ? new Date(parsed.data.closesAt) : null }
      : {}),
    ...(parsed.data.slug ? { slug: slugify(parsed.data.slug) } : {}),
    ...(shouldSetPublishedAt ? { publishedAt: new Date() } : {}),
  }

  const job = await prisma.jobPost.update({
    where: { id: existing.id },
    data: updates,
  })

  return NextResponse.json({ job })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { jobId } = await params
  const body = await req.json().catch(() => null)
  const parsed = deleteJobSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  if (parsed.data.confirmText.toUpperCase() !== 'DELETE') {
    return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 })
  }

  const job = await prisma.jobPost.findFirst({
    where: { id: jobId, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!job) return NextResponse.json({ error: 'Job post not found' }, { status: 404 })

  await prisma.jobPost.delete({ where: { id: job.id } })

  return NextResponse.json({ ok: true })
}
