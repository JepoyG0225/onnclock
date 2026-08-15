import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true, name: true, logoUrl: true, industry: true, website: true,
      careerBannerUrl: true, careerTagline: true, careerDescription: true,
      careerSocialFacebook: true, careerSocialLinkedin: true,
      careerSocialTwitter: true, careerSocialInstagram: true,
    },
  })
  if (!company) return NextResponse.json({ error: 'Career page not found' }, { status: 404 })

  const now = new Date()
  const jobs = await prisma.jobPost.findMany({
    where: { companyId, visibility: 'PUBLISHED', OR: [{ closesAt: null }, { closesAt: { gte: now } }] },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: { id: true, title: true, department: true, location: true, employmentType: true, workSetup: true, salaryMin: true, salaryMax: true, publicApplyToken: true },
  })
  return NextResponse.json({ company, jobs })
}
