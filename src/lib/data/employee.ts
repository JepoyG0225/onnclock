import { cache } from 'react'
import { prisma } from '@/lib/prisma'

export const getEmployeeLiteByUser = cache(async (userId: string, companyId: string) => {
  return prisma.employee.findFirst({
    where: { userId, companyId },
    select: { firstName: true, lastName: true, photoUrl: true, employeeNo: true },
  }).catch(() => null)
})
