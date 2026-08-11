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

/**
 * Task Management is behind an account allow-list while it's in beta.
 *
 * The module's tables are created by POST /api/admin/run-migrations rather
 * than at build time, so until that has been run against an environment the
 * whole module would 500. Restricting it to known accounts keeps it invisible
 * to real customers while it's exercised on the demo tenant.
 *
 * Extra addresses can be allowed via the TASKS_BETA_EMAILS env var
 * (comma-separated), mirroring UNCAPPED_COMPANY_NAMES in billing/seat-limit.
 *
 * Remove this gate — and its two call sites (the dashboard layout and
 * src/lib/tasks/guard.ts) — to launch the module generally.
 */
const TASKS_BETA_EMAILS = new Set(
  ['demo@onclockph.com', ...(process.env.TASKS_BETA_EMAILS ?? '').split(',')]
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
)

/** Whether this signed-in address may use the Task Management module. */
export function hasTaskModuleBetaAccess(email?: string | null): boolean {
  return !!email && TASKS_BETA_EMAILS.has(email.trim().toLowerCase())
}

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
