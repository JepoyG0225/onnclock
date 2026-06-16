import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const updateStepSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']).optional(),
  notes: z.string().max(1000).optional().nullable(),
  proofUrl: z.string().max(2000).optional().nullable(),
  // base64 file upload – data:mime;base64,... (max 10 MB decoded)
  proofFile: z.string().max(14_000_000).optional().nullable(),
  proofFileName: z.string().max(260).optional().nullable(),
})

async function uploadProofFile(
  companyId: string,
  processId: string,
  stepId: string,
  dataUrl: string,
  fileName: string
): Promise<string> {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Invalid file data')
  const mime = match[1]
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length > 10 * 1024 * 1024) throw new Error('File exceeds 10 MB limit')

  const ext = fileName.split('.').pop() ?? 'bin'
  const safeName = `${Date.now()}.${ext}`
  const objectPath = `onboarding/${companyId}/${processId}/${stepId}/${safeName}`
  const bucket = process.env.SUPABASE_LOGO_BUCKET || 'company-logos'

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.storage
    .from(bucket)
    .upload(objectPath, buffer, { contentType: mime, upsert: true })
  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath)
  return data.publicUrl
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ processId: string; stepId: string }> }
) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { processId, stepId } = await params
  const body = await req.json().catch(() => null)
  const parsed = updateStepSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const process = await prisma.onboardingProcess.findFirst({
    where: { id: processId, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!process) return NextResponse.json({ error: 'Process not found' }, { status: 404 })

  const existingStep = await prisma.onboardingStepProgress.findFirst({
    where: { id: stepId, processId: process.id },
    select: { id: true, metadata: true },
  })
  if (!existingStep) return NextResponse.json({ error: 'Step not found' }, { status: 404 })

  const now = new Date()
  const { status, notes, proofUrl, proofFile, proofFileName } = parsed.data

  // Resolve final proof URL
  let finalProofUrl: string | null | undefined = proofUrl
  if (proofFile && proofFileName) {
    try {
      finalProofUrl = await uploadProofFile(ctx.companyId, processId, stepId, proofFile, proofFileName)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  // Accumulate attachments in metadata
  const existingMeta = (existingStep.metadata ?? {}) as Record<string, unknown>
  const existingAttachments = Array.isArray(existingMeta.attachments) ? existingMeta.attachments : []
  const newMeta = finalProofUrl !== undefined
    ? {
        ...existingMeta,
        attachments: [
          ...existingAttachments,
          ...(finalProofUrl && !existingAttachments.some((a: unknown) => (a as Record<string,string>).url === finalProofUrl)
            ? [{ url: finalProofUrl, name: proofFileName ?? 'Attachment', addedAt: now.toISOString() }]
            : []),
        ],
      }
    : existingMeta

  const updateData: Record<string, unknown> = {
    metadata: newMeta,
  }
  if (status !== undefined) {
    updateData.status = status
    updateData.completedAt = status === 'COMPLETED' ? now : null
  }
  if (notes !== undefined) updateData.notes = notes
  if (finalProofUrl !== undefined) updateData.proofUrl = finalProofUrl ?? null

  const step = await prisma.onboardingStepProgress.update({
    where: { id: stepId },
    data: updateData,
    select: { id: true, status: true, completedAt: true, notes: true, proofUrl: true, metadata: true },
  })

  // Update process completion
  if (status !== undefined) {
    const allSteps = await prisma.onboardingStepProgress.findMany({
      where: { processId: process.id },
      select: { status: true, isRequired: true },
    })
    const required = allSteps.filter((s) => s.isRequired)
    const allDone = required.length > 0 && required.every((s) => s.status === 'COMPLETED')
    await prisma.onboardingProcess.update({
      where: { id: process.id },
      data: { status: allDone ? 'COMPLETED' : 'IN_PROGRESS', completedAt: allDone ? now : null },
    })
  }

  return NextResponse.json({ step })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ processId: string; stepId: string }> }
) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const { processId, stepId } = await params
  const process = await prisma.onboardingProcess.findFirst({
    where: { id: processId, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!process) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.onboardingStepProgress.delete({ where: { id: stepId, processId: process.id } })
  return NextResponse.json({ ok: true })
}
