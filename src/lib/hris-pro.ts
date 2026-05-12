import { NextResponse } from 'next/server'
import { PLAN_PRICE, getCompanyPricePerSeat, getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'

export async function getHrisProAccess(companyId: string): Promise<{
  entitled: boolean
  currentPricePerSeat: number
  requiredPricePerSeat: number
}> {
  const currentPricePerSeat = await getCompanyPricePerSeat(companyId)
  return {
    entitled: hasHrisProFeature(currentPricePerSeat),
    currentPricePerSeat,
    requiredPricePerSeat: PLAN_PRICE.HRIS_PRO,
  }
}

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
