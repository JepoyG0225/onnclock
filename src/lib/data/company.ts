import { cache } from 'react'
import { prisma } from '@/lib/prisma'

export const getCompanyLite = cache(async (companyId: string) => {
  return prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, logoUrl: true },
  }).catch(() => null)
})

export const getCompanyName = cache(async (companyId: string) => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  }).catch(() => null)

  return company?.name
})
