import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { requireHrisProApi } from '@/lib/hris-pro'
import { prisma } from '@/lib/prisma'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'
import { DEFAULT_RECRUITMENT_PIPELINE, ensureRecruitmentPipeline } from '@/lib/recruitment-pipeline'

function isPipelineSchemaMissing(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error.code === 'P2021' || error.code === 'P2022')
}

const legacyPipelineStages = DEFAULT_RECRUITMENT_PIPELINE.map((stage, order) => ({
  ...stage,
  id: `legacy-${stage.category}`,
  order,
}))

export async function GET() {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  try {
    const pipelineStages = await ensureRecruitmentPipeline(ctx.companyId)
    const applications = await prisma.jobApplication.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ lastStageUpdatedAt: 'desc' }, { appliedAt: 'desc' }],
      select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      source: true,
      stage: true,
      appliedAt: true,
      lastStageUpdatedAt: true,
      expectedSalary: true,
      resumeUrl: true,
      hiredEmployeeId: true,
      pipelineStageId: true,
      pipelineStage: { select: { id: true, name: true, color: true, category: true, order: true } },
      jobPost: {
        select: { id: true, title: true, department: true, location: true },
      },
      },
    })

    return NextResponse.json({ applications, pipelineStages })
  } catch (error) {
    if (!isPipelineSchemaMissing(error)) throw error

    // Keep recruitment usable while an older database is waiting for the
    // custom-pipeline migration. Standard stages remain fully functional.
    const applications = await prisma.jobApplication.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ lastStageUpdatedAt: 'desc' }, { appliedAt: 'desc' }],
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true,
        source: true, stage: true, appliedAt: true, lastStageUpdatedAt: true,
        expectedSalary: true, resumeUrl: true, hiredEmployeeId: true,
        jobPost: { select: { id: true, title: true, department: true, location: true } },
      },
    })
    const normalized = applications.map(application => {
      const pipelineStage = legacyPipelineStages.find(stage => stage.category === application.stage) ?? legacyPipelineStages[0]
      return { ...application, pipelineStageId: pipelineStage.id, pipelineStage }
    })
    return NextResponse.json({ applications: normalized, pipelineStages: legacyPipelineStages, pipelineMode: 'legacy' })
  }
}
