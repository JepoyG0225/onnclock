import { prisma } from '@/lib/prisma'

export const PLAN_PRICE = {
  BASE: 50,
  SECURITY: 70,
  HRIS_PRO: 100,
} as const

export async function getCompanyPricePerSeat(companyId: string): Promise<number> {
  const subscription = await prisma.subscription.findUnique({
    where: { companyId },
    select: { pricePerSeat: true },
  })
  return Number(subscription?.pricePerSeat ?? 0)
}

export async function getCompanySubscription(companyId: string): Promise<{ pricePerSeat: number; isTrial: boolean }> {
  const subscription = await prisma.subscription.findUnique({
    where: { companyId },
    select: { pricePerSeat: true, status: true },
  })
  return {
    pricePerSeat: Number(subscription?.pricePerSeat ?? 0),
    isTrial: subscription?.status === 'TRIAL',
  }
}

export function hasSecurityFeature(pricePerSeat: number): boolean {
  return pricePerSeat >= PLAN_PRICE.SECURITY
}

export function hasHrisProFeature(pricePerSeat: number): boolean {
  return pricePerSeat >= PLAN_PRICE.HRIS_PRO
}

/** Screen capture requires TRIAL or PRO (≥ ₱100/seat) */
export function hasScreenCaptureFeature(pricePerSeat: number, isTrial: boolean): boolean {
  return isTrial || pricePerSeat >= PLAN_PRICE.HRIS_PRO
}

/** Desktop app UA: "OnClock-Desktop/x.x.x (Windows)" */
export function isDesktopApp(userAgent: string): boolean {
  return /OnClock-Desktop\//i.test(userAgent)
}
