import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const COMPANY_ID = 'cmpzsccs90002x8tmrguyeepy'

const wfs = await prisma.approvalWorkflow.findMany({
  where: { companyId: COMPANY_ID },
  include: { steps: { orderBy: { order: 'asc' } } },
})
for (const wf of wfs) {
  console.log(`Workflow: type=${wf.type} active=${wf.isActive} name=${wf.name} id=${wf.id}`)
  for (const s of wf.steps) {
    let label = ''
    if (s.approverUserId) {
      const u = await prisma.user.findUnique({ where: { id: s.approverUserId }, select: { name: true, email: true } })
      label = `user=${u?.name ?? '?'} (${u?.email ?? '-'})`
    }
    console.log(`  step#${s.order} type=${s.stepType} approverType=${s.approverType ?? '-'} ${label}`)
  }
  console.log()
}
process.exit(0)
