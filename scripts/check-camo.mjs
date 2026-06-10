import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const emp = await prisma.employee.findFirst({
  where: { firstName: { contains: 'GERALDINE', mode: 'insensitive' }, lastName: { contains: 'CAMO', mode: 'insensitive' } },
})
if (!emp) { console.log('Employee not found'); process.exit(0) }
console.log('Employee:', emp.id, emp.lastName, emp.firstName, '| companyId:', emp.companyId)
console.log('userId:', emp.userId)

if (emp.userId) {
  const uc = await prisma.userCompany.findFirst({ where: { userId: emp.userId, companyId: emp.companyId } })
  console.log('UserCompany role:', uc?.role, 'active:', uc?.isActive)
}

// Check matrix override for the company
const overrides = await prisma.companyRolePermission.findMany({
  where: { companyId: emp.companyId },
  select: { role: true, permissions: true },
})
console.log('\nRole overrides for company:')
for (const o of overrides) {
  console.log(' ', o.role, '→', JSON.stringify(o.permissions))
}
process.exit(0)
