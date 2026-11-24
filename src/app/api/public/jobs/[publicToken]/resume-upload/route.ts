import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { acceptingJob } from '@/lib/public-job-application'
import { issueResumeUpload } from '@/lib/recruitment-resume-storage'
import { resumeFileType } from '@/lib/recruitment-upload'

const schema = z.object({ email: z.string().trim().email().transform(v => v.toLowerCase()), name: z.string().min(1).max(255), type: z.string().max(150), size: z.number().int().positive() })
export async function POST(req: NextRequest, { params }: { params: Promise<{ publicToken: string }> }) {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email and select a résumé file.' }, { status: 400 })
  try { resumeFileType(parsed.data) } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
  try {
    const result = await acceptingJob((await params).publicToken)
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
    const upload = await issueResumeUpload(result.job, parsed.data.email, parsed.data)
    return NextResponse.json(upload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[resume-upload] Unable to prepare upload', err instanceof Error ? err.message : 'Unknown error')
    return NextResponse.json({ error: 'Résumé upload is temporarily unavailable. Please try again.' }, { status: 503 })
  }
}
