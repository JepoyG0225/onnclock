import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const user = await prisma.user.findFirst({
  where: { OR: [
    { name: { contains: 'MISHIELYN', mode: 'insensitive' } },
    { name: { contains: 'GALVEZ', mode: 'insensitive' } },
    { email: { contains: 'galvez', mode: 'insensitive' } },
    { email: { contains: 'mishielyn', mode: 'insensitive' } },
  ]},
  include: { companies: { include: { company: { select: { id: true, name: true } } } } },
})
if (!user) { console.log('User not found'); process.exit(0) }
console.log('User:', user.id, user.email, user.name)
for (const uc of user.companies) {
  console.log('  Company:', uc.company.name, '| role:', uc.role, '| active:', uc.isActive, '| companyId:', uc.companyId)
}

// For each company, look at Feb 1-15 payroll runs and the approver chain
for (const uc of user.companies) {
  console.log('\n=== Company:', uc.company.name, '===')
  const runs = await prisma.payrollRun.findMany({
    where: {
      companyId: uc.companyId,
      periodStart: { gte: new Date('2026-02-01'), lte: new Date('2026-02-02') },
    },
    select: {
      id: true, periodLabel: true, status: true, approvalLevel: true, approvalTrail: true,
      periodStart: true, periodEnd: true,
    },
  })
  for (const r of runs) {
    console.log(`Run ${r.id} | ${r.periodLabel} | status=${r.status} | approvalLevel=${r.approvalLevel}`)
    console.log('  approvalTrail:', JSON.stringify(r.approvalTrail))
  }

  const approvers = await prisma.approverConfig.findMany({
    where: { companyId: uc.companyId, type: 'PAYROLL' },
    orderBy: { level: 'asc' },
    include: { user: { select: { name: true, email: true } } },
  })
  console.log('Payroll approver chain:')
  for (const a of approvers) {
    console.log(`  L${a.level}:`, a.user?.name ?? '?', `(${a.user?.email})`, 'userId=' + a.userId, a.userId === user.id ? '← Mishielyn' : '')
  }

  // Permissions check
  const override = await prisma.companyRolePermission.findUnique({
    where: { companyId_role: { companyId: uc.companyId, role: uc.role } },
    select: { permissions: true },
  })
  console.log(`Role override for ${uc.role}:`, JSON.stringify(override?.permissions ?? null))
}

process.exit(0)
