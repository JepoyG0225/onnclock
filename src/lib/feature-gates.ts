import { prisma } from '@/lib/prisma'

export const PLAN_PRICE = {
  BASE: 50,
  SECURITY: 70,
  HRIS_PRO: 70,
} as const

export async function getCompanyPricePerSeat(companyId: string): Promise<number> {
  const subscription = await prisma.subscription.findUnique({
    where: { companyId },
    select: { pricePerSeat: true },
  })
  return Number(subscription?.pricePerSeat ?? 0)
}

export function hasSecurityFeature(pricePerSeat: number): boolean {
  return pricePerSeat >= PLAN_PRICE.SECURITY
}

export function hasHrisProFeature(pricePerSeat: number): boolean {
  return pricePerSeat >= PLAN_PRICE.HRIS_PRO
}
