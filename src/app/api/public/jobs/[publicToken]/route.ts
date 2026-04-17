import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getHrisProAccess } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

const companyFields = new Set(
  (Prisma.dmmf.datamodel.models.find((m) => m.name === 'Company')?.fields ?? []).map((f) => f.name)
)

function companySelect<T extends Record<string, true>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([k]) => companyFields.has(k))
  ) as Partial<T>
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ publicToken: string }> }) {
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { publicToken } = await params

  const job = await prisma.jobPost.findUnique({
    where: { publicApplyToken: publicToken },
    include: {
      company: {
        select: companySelect({
          id: true,
          name: true,
          logoUrl: true,
          industry: true,
          website: true,
          careerBannerUrl: true,
          careerTagline: true,
          careerDescription: true,
          careerSocialFacebook: true,
          careerSocialLinkedin: true,
          careerSocialTwitter: true,
          careerSocialInstagram: true,
        }),
      },
    },
  })

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const access = await getHrisProAccess(job.companyId)
  if (!access.entitled) {
    return NextResponse.json({ error: 'This company does not have Pro access.' }, { status: 403 })
  }

  const now = new Date()
  const isOpen = job.visibility === 'PUBLISHED' && (!job.closesAt || job.closesAt >= now)
  const requirements = Array.isArray(job.requirements) ? job.requirements.map((x) => String(x)) : []
  const benefits = Array.isArray(job.benefits) ? job.benefits.map((x) => String(x)) : []

  const otherJobs = await prisma.jobPost.findMany({
    where: {
      companyId: job.companyId,
      id: { not: job.id },
      visibility: 'PUBLISHED',
      OR: [
        { closesAt: null },
        { closesAt: { gte: now } },
      ],
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: 6,
    select: {
      id: true,
      title: true,
      department: true,
      location: true,
      employmentType: true,
      workSetup: true,
      salaryMin: true,
      salaryMax: true,
      publicApplyToken: true,
    },
  })

  return NextResponse.json({
    job: {
      id: job.id,
      title: job.title,
      description: job.description,
      department: job.department,
      employmentType: job.employmentType,
      workSetup: job.workSetup,
      location: job.location,
      requirements,
      benefits,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      closesAt: job.closesAt,
      isOpen,
      company: {
        name: job.company.name ?? '',
        logoUrl: (job.company as Record<string, unknown>).logoUrl ?? null,
        industry: (job.company as Record<string, unknown>).industry ?? null,
        website: (job.company as Record<string, unknown>).website ?? null,
        careerBannerUrl: (job.company as Record<string, unknown>).careerBannerUrl ?? null,
        careerTagline: (job.company as Record<string, unknown>).careerTagline ?? null,
        careerDescription: (job.company as Record<string, unknown>).careerDescription ?? null,
        careerSocialFacebook: (job.company as Record<string, unknown>).careerSocialFacebook ?? null,
        careerSocialLinkedin: (job.company as Record<string, unknown>).careerSocialLinkedin ?? null,
        careerSocialTwitter: (job.company as Record<string, unknown>).careerSocialTwitter ?? null,
        careerSocialInstagram: (job.company as Record<string, unknown>).careerSocialInstagram ?? null,
      },
    },
    otherJobs,
  })
}
