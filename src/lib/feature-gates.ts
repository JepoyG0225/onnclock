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

// Task Management was behind an email allow-list (demo@onclockph.com) while in
// beta, because its tables are applied by POST /api/admin/run-migrations rather
// than at build time and the module would 500 anywhere they were missing. The
// full v2 schema is now applied in production — all 11 task_* tables exist and
// every model queries — so the allow-list and the TASKS_BETA_EMAILS env var are
// gone and the module is generally available.
//
// Access is now governed by the normal rules: the `tasks:read` / `tasks:manage`
// permissions (held by every built-in role) and the HRIS-Pro entitlement in
// src/lib/tasks/guard.ts.

/** Desktop app UA: "OnClock-Desktop/x.x.x (Windows)" */
export function isDesktopApp(userAgent: string): boolean {
  return /OnClock-Desktop\//i.test(userAgent)
}

/**
 * Check whether a company can use HRIS-Pro features (disbursement, etc).
 * Trial subscriptions get full Pro access so customers can evaluate the
 * paid feature set before committing.
 */
export async function checkHrisProAccess(companyId: string): Promise<boolean> {
  const sub = await getCompanySubscription(companyId)
  return sub.isTrial || hasHrisProFeature(sub.pricePerSeat)
}
