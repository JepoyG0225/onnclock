import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

const createJobSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  requirements: z.array(z.string().min(1)).default([]),
  benefits: z.array(z.string().min(1)).default([]),
  department: z.string().optional().nullable(),
  employmentType: z.string().optional().nullable(),
  workSetup: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  salaryMin: z.number().nonnegative().optional().nullable(),
  salaryMax: z.number().nonnegative().optional().nullable(),
  visibility: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).default('DRAFT'),
  closesAt: z.string().datetime().optional().nullable(),
  slug: z.string().optional().nullable(),
}).superRefine((val, ctx) => {
  if (val.salaryMin != null && val.salaryMax != null && val.salaryMax < val.salaryMin) {
    ctx.addIssue({
      code: 'custom',
      path: ['salaryMax'],
      message: 'salaryMax must be greater than or equal to salaryMin',
    })
  }
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

async function resolveUniqueSlug(companyId: string, source: string): Promise<string> {
  const base = slugify(source)
  const existing = await prisma.jobPost.findMany({
    where: {
      companyId,
      OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }],
    },
    select: { slug: true },
  })

  if (!existing.some((x) => x.slug === base)) return base

  let i = 2
  while (existing.some((x) => x.slug === `${base}-${i}`)) i += 1
  return `${base}-${i}`
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { searchParams } = new URL(req.url)
  const visibility = searchParams.get('visibility')
  const q = searchParams.get('q')?.trim() ?? ''

  const jobs = await prisma.jobPost.findMany({
    where: {
      companyId: ctx.companyId,
      ...(visibility ? { visibility: visibility as 'DRAFT' | 'PUBLISHED' | 'CLOSED' } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      _count: {
        select: { applications: true },
      },
    },
  })

  return NextResponse.json({ jobs })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const body = await req.json().catch(() => null)
  const parsed = createJobSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data
  const slugSource = data.slug?.trim() || data.title
  const slug = await resolveUniqueSlug(ctx.companyId, slugSource)

  const now = new Date()
  const job = await prisma.jobPost.create({
    data: {
      companyId: ctx.companyId,
      title: data.title.trim(),
      slug,
      description: data.description.trim(),
      requirements: data.requirements,
      benefits: data.benefits,
      department: data.department?.trim() || null,
      employmentType: data.employmentType?.trim() || null,
      workSetup: data.workSetup?.trim() || null,
      location: data.location?.trim() || null,
      salaryMin: data.salaryMin ?? null,
      salaryMax: data.salaryMax ?? null,
      visibility: data.visibility,
      closesAt: data.closesAt ? new Date(data.closesAt) : null,
      createdByUserId: ctx.userId,
      publishedAt: data.visibility === 'PUBLISHED' ? now : null,
    },
  })

  return NextResponse.json({ job }, { status: 201 })
}
