import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getHrisProAccess } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

const applySchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  currentAddress: z.string().optional().nullable(),
  expectedSalary: z.number().nonnegative().optional().nullable(),
  coverLetter: z.string().optional().nullable(),
  requirementAnswers: z.record(z.string(), z.string()).optional().default({}),
})

const ALLOWED_RESUME_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function extensionFromMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'application/msword') return 'doc'
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  return 'bin'
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ publicToken: string }> }) {
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
    expectedSalary: Number.isFinite(expectedSalary) ? expectedSalary : null,
    coverLetter: String(form.get('coverLetter') ?? ''),
  }

  const parsed = applySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const job = await prisma.jobPost.findUnique({
    where: { publicApplyToken: publicToken },
    select: {
      id: true,
      companyId: true,
      visibility: true,
      closesAt: true,
    },
  })

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const access = await getHrisProAccess(job.companyId)
  if (!access.entitled) {
    return NextResponse.json({ error: 'This company does not have Pro access.' }, { status: 403 })
  }

  if (job.visibility !== 'PUBLISHED') {
    return NextResponse.json({ error: 'This job is not accepting applications.' }, { status: 409 })
  }

  if (job.closesAt && job.closesAt < new Date()) {
    return NextResponse.json({ error: 'This job post is already closed.' }, { status: 409 })
  }

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

  const resumeFile = form.get('resumeFile')
  let resumeUrl: string | null = null
  if (resumeFile instanceof File && resumeFile.size > 0) {
    if (!ALLOWED_RESUME_MIME.has(resumeFile.type)) {
      return NextResponse.json({ error: 'Resume must be a PDF, DOC, or DOCX file.' }, { status: 400 })
    }

    const maxResumeBytes = 10 * 1024 * 1024
    if (resumeFile.size > maxResumeBytes) {
      return NextResponse.json({ error: 'Resume file exceeds 10MB size limit.' }, { status: 400 })
    }

    const ext = extensionFromMime(resumeFile.type)
    const safeName = (resumeFile.name || `resume.${ext}`).replace(/[^\w.\-]+/g, '_')
    const filename = `${Date.now()}-${randomUUID()}-${safeName}`
    const dir = path.join(process.cwd(), 'public', 'uploads', 'recruitment-resumes', job.companyId, job.id)
    await mkdir(dir, { recursive: true })
    const absPath = path.join(dir, filename)
    const buffer = Buffer.from(await resumeFile.arrayBuffer())
    await writeFile(absPath, buffer)
    resumeUrl = `/uploads/recruitment-resumes/${job.companyId}/${job.id}/${filename}`
  }

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
    },
    select: {
      id: true,
      appliedAt: true,
      stage: true,
    },
  })

  return NextResponse.json({ application }, { status: 201 })
}
