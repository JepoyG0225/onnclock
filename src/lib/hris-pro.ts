import { NextResponse } from 'next/server'
import { PLAN_PRICE, getCompanyPricePerSeat, hasHrisProFeature } from '@/lib/feature-gates'

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
