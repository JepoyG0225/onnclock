import { prisma } from '@/lib/prisma'
import type { RecruitmentStage } from '@prisma/client'

export const DEFAULT_RECRUITMENT_PIPELINE: Array<{
  name: string
  color: string
  category: RecruitmentStage
  isDefault: boolean
}> = [
  { name: 'Applied', color: '#0b6ffb', category: 'APPLIED', isDefault: true },
  { name: 'Screening', color: '#8b5cf6', category: 'SCREENING', isDefault: false },
  { name: 'Interview', color: '#f59e0b', category: 'INTERVIEW', isDefault: false },
  { name: 'Final Interview', color: '#f97316', category: 'FINAL_INTERVIEW', isDefault: false },
  { name: 'Offer', color: '#06b6d4', category: 'OFFER', isDefault: false },
  { name: 'Hired', color: '#10b981', category: 'HIRED', isDefault: false },
  { name: 'Rejected', color: '#ef4444', category: 'REJECTED', isDefault: false },
  { name: 'Withdrawn', color: '#64748b', category: 'WITHDRAWN', isDefault: false },
]

export async function ensureRecruitmentPipeline(companyId: string) {
  let stages = await prisma.recruitmentPipelineStage.findMany({ where: { companyId }, orderBy: { order: 'asc' } })
  if (stages.length === 0) {
    await prisma.recruitmentPipelineStage.createMany({
      data: DEFAULT_RECRUITMENT_PIPELINE.map((stage, order) => ({ companyId, ...stage, order })),
      skipDuplicates: true,
    })
    stages = await prisma.recruitmentPipelineStage.findMany({ where: { companyId }, orderBy: { order: 'asc' } })
  }

  // Existing applications predate custom pipelines. Attach them to the first
  // configured stage matching their system category without changing history.
  for (const category of DEFAULT_RECRUITMENT_PIPELINE.map(stage => stage.category)) {
    const target = stages.find(stage => stage.category === category)
    if (target) {
      await prisma.jobApplication.updateMany({
        where: { companyId, pipelineStageId: null, stage: category },
        data: { pipelineStageId: target.id },
      })
    }
  }
  return stages
}

export async function pipelineStageForCategory(companyId: string, category: RecruitmentStage) {
  const stages = await ensureRecruitmentPipeline(companyId)
  return stages.find(stage => stage.category === category) ?? null
}
