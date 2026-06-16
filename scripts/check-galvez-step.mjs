import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const COMPANY_ID = 'cmpzsccs90002x8tmrguyeepy'
const MISHIELYN_ID = 'cmpzsccps0001x8tmr42eyz5a'

const wf = await prisma.approvalWorkflow.findFirst({
  where: { companyId: COMPANY_ID, type: 'PAYROLL', isActive: true, departmentId: null },
  include: { steps: { orderBy: { order: 'asc' } } },
})
console.log('Workflow:', wf?.id, 'isActive=', wf?.isActive, 'name=', wf?.name)
for (const s of wf?.steps ?? []) {
  console.log(`  step#${s.order} type=${s.stepType} approverType=${s.approverType} approverUserId=${s.approverUserId} approverRole=${s.approverRole} conditions=${JSON.stringify(s.conditions)}`)
  console.log(`    matches Mishielyn? ${s.approverUserId === MISHIELYN_ID}`)
}

const run = await prisma.payrollRun.findFirst({
  where: { companyId: COMPANY_ID, periodLabel: { contains: 'February 1' } },
})
console.log('\nRun:', run?.id, 'status=', run?.status, 'approvalLevel=', run?.approvalLevel)
console.log('Run totalGross =', run?.totalGross?.toString())
process.exit(0)
