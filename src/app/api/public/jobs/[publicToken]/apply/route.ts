import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { acceptingJob } from '@/lib/public-job-application'
import { resolveUploadedResume } from '@/lib/recruitment-resume-storage'
import { prisma } from '@/lib/prisma'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'
import { pipelineStageForCategory } from '@/lib/recruitment-pipeline'

const applySchema = z.object({
  firstName: z.string().trim().min(1).max(200),
  lastName: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  phone: z.string().optional().nullable(),
  currentAddress: z.string().optional().nullable(),
  expectedSalary: z.number().nonnegative().optional().nullable(),
  coverLetter: z.string().optional().nullable(),
  requirementAnswers: z.record(z.string(), z.string()).optional().default({}),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ publicToken: string }> }) {
  try {
    if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

    const { publicToken } = await params

    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: 'Invalid form payload' }, { status: 400 })
    }

    const expectedSalaryRaw = String(form.get('expectedSalary') ?? '').trim()
    const expectedSalary = expectedSalaryRaw ? Number(expectedSalaryRaw) : null

    const body = {
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      currentAddress: String(form.get('currentAddress') ?? ''),
      expectedSalary,
      coverLetter: String(form.get('coverLetter') ?? ''),
    }

    const parsed = applySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Please check your application details.' }, { status: 400 })

    const result = await acceptingJob(publicToken)
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
    const job = result.job

    const email = parsed.data.email.trim().toLowerCase()
    const duplicate = await prisma.jobApplication.findFirst({
      where: {
        jobPostId: job.id,
        email,
        stage: { notIn: ['WITHDRAWN', 'REJECTED'] },
      },
      select: { id: true },
    })

    if (duplicate) {
      return NextResponse.json({ error: 'You already submitted an application for this job.' }, { status: 409 })
    }

    // The browser uploads bytes directly to storage, avoiding the hosting body limit.
    if (form.get('resumeFile') instanceof File) {
      return NextResponse.json({ error: 'Please refresh this page and select your r?sum? again to use the updated upload form.' }, { status: 400 })
    }
    const receipt = String(form.get('resumeReceipt') ?? '')
    let resumeUrl: string | null = null
    if (receipt) {
      if (receipt.length > 8192) return NextResponse.json({ error: 'Invalid r?sum? upload.' }, { status: 400 })
      try { resumeUrl = await resolveUploadedResume(receipt, job, email) }
      catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : 'Unable to verify r?sum? upload.' }, { status: 400 }) }
    }

    const appliedStage = await pipelineStageForCategory(job.companyId, 'APPLIED')
    const application = await prisma.jobApplication.create({
      data: {
        companyId: job.companyId,
        jobPostId: job.id,
        firstName: parsed.data.firstName.trim(),
        lastName: parsed.data.lastName.trim(),
        email,
        phone: parsed.data.phone?.trim() || null,
        currentAddress: parsed.data.currentAddress?.trim() || null,
        expectedSalary: parsed.data.expectedSalary ?? null,
        resumeUrl,
        coverLetter: parsed.data.coverLetter?.trim() || null,
        requirementAnswers: parsed.data.requirementAnswers,
        source: 'PUBLIC_PORTAL',
        pipelineStageId: appliedStage?.id ?? null,
      },
      select: {
        id: true,
        appliedAt: true,
        stage: true,
      },
    })

    return NextResponse.json({ application }, { status: 201 })
  } catch (err) {
    console.error('[public application] Submission failed', err instanceof Error ? err.name : 'Unknown error')
    return NextResponse.json({ error: 'Unable to save your application right now. Please try again.' }, { status: 500 })
  }
}
