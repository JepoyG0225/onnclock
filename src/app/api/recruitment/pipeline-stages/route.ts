import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { requireHrisProApi } from '@/lib/hris-pro'
import { prisma } from '@/lib/prisma'
import { ensureRecruitmentPipeline } from '@/lib/recruitment-pipeline'

const category = z.enum(['APPLIED', 'SCREENING', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN'])
const createSchema = z.object({ name: z.string().trim().min(1).max(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), category })
const updateSchema = z.object({ id: z.string(), name: z.string().trim().min(1).max(60).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), category: category.optional(), order: z.number().int().min(0).optional() })

async function guard() {
  const auth = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (auth.error) return { error: auth.error } as const
  const gate = await requireHrisProApi(auth.ctx.companyId)
  if (gate) return { error: gate } as const
  return { ctx: auth.ctx } as const
}

export async function GET() {
  const result = await guard()
  if ('error' in result) return result.error
  const stages = await ensureRecruitmentPipeline(result.ctx.companyId)
  return NextResponse.json({ stages })
}

export async function POST(req: NextRequest) {
  const result = await guard()
  if ('error' in result) return result.error
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid stage' }, { status: 400 })
  const count = await prisma.recruitmentPipelineStage.count({ where: { companyId: result.ctx.companyId } })
  const stage = await prisma.recruitmentPipelineStage.create({ data: { companyId: result.ctx.companyId, ...parsed.data, order: count } })
  return NextResponse.json({ stage }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const result = await guard()
  if ('error' in result) return result.error
  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid stage' }, { status: 400 })
  const current = await prisma.recruitmentPipelineStage.findFirst({ where: { id: parsed.data.id, companyId: result.ctx.companyId } })
  if (!current) return NextResponse.json({ error: 'Pipeline stage not found' }, { status: 404 })
  const stage = await prisma.recruitmentPipelineStage.update({ where: { id: current.id }, data: { name: parsed.data.name, color: parsed.data.color, category: parsed.data.category, order: parsed.data.order } })
  if (parsed.data.category && parsed.data.category !== current.category) {
    await prisma.jobApplication.updateMany({ where: { pipelineStageId: current.id }, data: { stage: parsed.data.category } })
  }
  return NextResponse.json({ stage })
}

export async function DELETE(req: NextRequest) {
  const result = await guard()
  if ('error' in result) return result.error
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Stage id is required' }, { status: 400 })
  const stages = await ensureRecruitmentPipeline(result.ctx.companyId)
  const current = stages.find(stage => stage.id === id)
  if (!current) return NextResponse.json({ error: 'Pipeline stage not found' }, { status: 404 })
  if (stages.length <= 1) return NextResponse.json({ error: 'At least one pipeline stage is required' }, { status: 400 })
  const replacement = stages.find(stage => stage.id !== id && stage.category === current.category) ?? stages.find(stage => stage.id !== id)!
  await prisma.$transaction([
    prisma.jobApplication.updateMany({ where: { pipelineStageId: id }, data: { pipelineStageId: replacement.id, stage: replacement.category } }),
    prisma.recruitmentPipelineStage.delete({ where: { id } }),
  ])
  return NextResponse.json({ ok: true })
}
