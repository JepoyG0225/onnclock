import { prisma } from '@/lib/prisma'
import { getHrisProAccess } from '@/lib/hris-pro'

export async function acceptingJob(publicToken: string) {
  const job = await prisma.jobPost.findUnique({
    where: { publicApplyToken: publicToken },
    select: { id: true, companyId: true, visibility: true, closesAt: true },
  })
  if (!job) return { error: 'Job not found', status: 404 } as const
  if (job.visibility !== 'PUBLISHED' || (job.closesAt && job.closesAt < new Date())) {
    return { error: 'This job is no longer accepting applications.', status: 409 } as const
  }
  if (!(await getHrisProAccess(job.companyId)).entitled) return { error: 'This company is not currently accepting applications.', status: 403 } as const
  return { job } as const
}
