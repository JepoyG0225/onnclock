import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const COMPANY_ID = 'cmnogr3ui0002h6wadorokmll'
const USER_ID = 'cmo8jd9s000004crit6kksci2'

const approvers = await prisma.approverConfig.findMany({
  where: { companyId: COMPANY_ID, type: 'LEAVE' },
  orderBy: { level: 'asc' },
  include: { user: { select: { name: true, email: true } } },
})
console.log('Leave approver chain for company:')
for (const a of approvers) {
  console.log(`  L${a.level}:`, a.user?.name ?? '?', `(${a.user?.email})`, 'userId=' + a.userId, a.userId === USER_ID ? '← Geraldine' : '')
}
if (approvers.length === 0) console.log('  (none configured — nobody can approve leaves)')
process.exit(0)
