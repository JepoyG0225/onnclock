import { NextResponse } from 'next/server'
import { PLAN_PRICE, getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'

/**
 * Resolve a company's HRIS-Pro entitlement.
 *
 * Trial subscribers get full Pro access so customers can evaluate every
 * paid feature (Recruitment, Onboarding, Performance Reviews, etc.)
 * before they decide whether to convert. Without this, the entire
 * Pro-tier UX would be invisible during trial — which made the trial
 * effectively a Free-tier trial and defeated its purpose.
 *
 * Returns the prosaic pricePerSeat alongside so callers can still show
 * upgrade prompts after the trial converts to a paid Base subscription.
 */
export async function getHrisProAccess(companyId: string): Promise<{
  entitled: boolean
  currentPricePerSeat: number
  requiredPricePerSeat: number
  isTrial: boolean
}> {
  const sub = await getCompanySubscription(companyId)
  return {
    entitled: sub.isTrial || hasHrisProFeature(sub.pricePerSeat),
    currentPricePerSeat: sub.pricePerSeat,
    requiredPricePerSeat: PLAN_PRICE.HRIS_PRO,
    isTrial: sub.isTrial,
  }
}

/**
 * API gate — grants Pro routes to TRIAL OR paid-Pro subscribers. The
 * previous behaviour gated solely on pricePerSeat which silently locked
 * trial users out of every Pro endpoint; that's now the same predicate
 * as getHrisProAccess() above.
 */
export async function requireHrisProApi(companyId: string): Promise<NextResponse | null> {
  const access = await getHrisProAccess(companyId)
  if (access.entitled) return null

  return NextResponse.json(
    {
      error: `Pro features require the Php ${access.requiredPricePerSeat} per employee plan.`,
      feature: {
        entitled: false,
        currentPricePerSeat: access.currentPricePerSeat,
        requiredPricePerSeat: access.requiredPricePerSeat,
      },
    },
    { status: 403 }
  )
}

/**
 * Gate a route to Pro plan OR active trial. Trial subscribers get full
 * Pro preview access — once their trial ends they're blocked unless they
 * upgrade. Mirrors the inline pattern used by /api/disciplinary,
 * /api/budget-requisitions, /api/offboarding etc.
 */
export async function requireHrisProOrTrialApi(companyId: string): Promise<NextResponse | null> {
  const sub = await getCompanySubscription(companyId)
  if (hasHrisProFeature(sub.pricePerSeat) || sub.isTrial) return null
  return NextResponse.json(
    {
      error: `This is a Pro feature. Upgrade to the Php ${PLAN_PRICE.HRIS_PRO}/seat plan to unlock it.`,
      notEntitled: true,
      feature: {
        entitled: false,
        currentPricePerSeat: sub.pricePerSeat,
        requiredPricePerSeat: PLAN_PRICE.HRIS_PRO,
      },
    },
    { status: 403 }
  )
}
