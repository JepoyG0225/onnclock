/**
 * Single source of truth for "is this company over their paid seats".
 *
 * Used by:
 *   - POST /api/employees      → hard cap before create
 *   - (dashboard) layout       → audit feeds SubscriptionGate
 *   - /settings/billing page   → over-seat warning banner
 *
 * Cap policy:
 *   - ACTIVE subscription      → enforce hard cap (activeCount ≤ paidSeats)
 *   - TRIAL                    → no cap (let companies explore freely)
 *   - EXPIRED / CANCELLED      → not enforced here; SubscriptionGate
 *                                already routes those to billing
 *   - No subscription record   → treat as "needs to subscribe" — block
 *                                creation past 1 employee just to nudge
 *                                them into the billing flow without
 *                                breaking initial company setup
 */
import { cache } from 'react'
import { prisma } from '@/lib/prisma'

export interface SeatStatus {
  /** Active employees currently in the company (isActive=true). */
  activeCount: number
  /** Seats the company is currently paying for. */
  paidSeats: number
  /** activeCount − paidSeats, clamped at 0. */
  unbilled: number
  /** Subscription status, or 'NO_SUBSCRIPTION' if no row exists. */
  status: string
  /** True only for statuses where the cap should block new creates. */
  enforceCap: boolean
  /** Convenience: enforceCap && unbilled > 0. */
  isOver: boolean
}

export interface PausedEmployee {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
  createdAt: Date
}

export interface PausedEmployees {
  ids: string[]
  details: PausedEmployee[]
}

/**
 * Identify which active employees exceed the company's paid seat count
 * and should have their portal access "paused for billing." Returns the
 * NEWEST `unbilled` employees (those who pushed the count past the
 * paid limit) sorted by createdAt DESC.
 *
 *   ACTIVE sub with unbilled = 3 → returns the 3 newest active employees
 *   TRIAL / no sub / not over    → returns empty arrays
 */
export const getPausedEmployees = cache(async (companyId: string): Promise<PausedEmployees> => {
  const seat = await getSeatStatus(companyId)
  if (!seat.enforceCap || seat.unbilled <= 0) return { ids: [], details: [] }

  const overflow = await prisma.employee.findMany({
    where: { companyId, isActive: true },
    select: { id: true, firstName: true, lastName: true, employeeNo: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: seat.unbilled,
  })
  return {
    ids: overflow.map(e => e.id),
    details: overflow,
  }
})

/**
 * Look up the seat status for a company. Wrapped in React `cache()` so a
 * single request that calls this multiple times (layout + API + helper)
 * only hits Prisma once.
 */
export const getSeatStatus = cache(async (companyId: string): Promise<SeatStatus> => {
  const [activeCount, sub] = await Promise.all([
    prisma.employee.count({ where: { companyId, isActive: true } }),
    prisma.subscription.findUnique({
      where: { companyId },
      select: { status: true, seatCount: true },
    }),
  ])

  const status = sub?.status ?? 'NO_SUBSCRIPTION'
  const paidSeats = sub?.seatCount ?? 0
  const unbilled = Math.max(0, activeCount - paidSeats)

  // Only ACTIVE subscribers get the hard cap. TRIAL is intentionally
  // unrestricted (the free-trial UX should let HR enroll their roster
  // without friction). EXPIRED/CANCELLED have a separate gate that
  // already redirects them to billing for anything but settings.
  const enforceCap = status === 'ACTIVE'
  const isOver = enforceCap && unbilled > 0

  return { activeCount, paidSeats, unbilled, status, enforceCap, isOver }
})
