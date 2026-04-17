import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  getAllLocalStorageUsedBytes,
  getStoragePlanInfo,
  formatStorage,
  STORAGE_ADDON_TIERS,
} from '@/lib/document-storage'

export async function GET() {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  // Fetch current subscription to determine plan tier + add-on
  const subscription = await prisma.subscription.findUnique({
    where: { companyId: ctx.companyId },
    select: { pricePerSeat: true, status: true, storageAddOnGb: true, storageAddOnPrice: true },
  }).catch(() =>
    // Fallback if migration hasn't run yet (columns missing)
    prisma.subscription.findUnique({
      where: { companyId: ctx.companyId },
      select: { pricePerSeat: true, status: true },
    })
  )

  const pricePerSeat = Number(subscription?.pricePerSeat ?? 0)
  const addOnGb = (subscription as { storageAddOnGb?: number } | null)?.storageAddOnGb ?? 0
  const addOnPrice = Number((subscription as { storageAddOnPrice?: number } | null)?.storageAddOnPrice ?? 0)
  const planInfo = getStoragePlanInfo(pricePerSeat, addOnGb, addOnPrice)

  // Count active employees (used for upgrade cost estimate)
  const employeeCount = await prisma.employee.count({
    where: { companyId: ctx.companyId, isActive: true },
  })

  // Measure actual disk usage (runs concurrently)
  const { docs, resumes, total } = await getAllLocalStorageUsedBytes(ctx.companyId)

  const usedPct = planInfo.limitBytes > 0
    ? Math.min(100, Math.round((total / planInfo.limitBytes) * 100))
    : 0

  return NextResponse.json({
    // Usage
    usedBytes: total,
    usedLabel: formatStorage(total),
    docsBytes: docs,
    docsLabel: formatStorage(docs),
    resumesBytes: resumes,
    resumesLabel: formatStorage(resumes),
    usedPct,

    // Plan
    planName: planInfo.planName,
    baseLimitLabel: planInfo.baseLimitLabel,
    limitBytes: planInfo.limitBytes,
    limitLabel: planInfo.limitLabel,
    pricePerSeat,
    isTopTier: planInfo.isTopTier,
    upgradePricePerSeat: planInfo.upgradePricePerSeat,

    // Storage add-on
    addOnGb: planInfo.addOnGb,
    addOnPrice: planInfo.addOnPrice,
    addOnLabel: planInfo.addOnLabel,
    addOnTiers: STORAGE_ADDON_TIERS,

    // Upgrade cost estimate
    employeeCount,
    upgradeMonthlyEstimate:
      planInfo.upgradePricePerSeat !== null && employeeCount > 0
        ? planInfo.upgradePricePerSeat * employeeCount
        : null,

    // Next month total estimate including add-on
    currentMonthlyBase: pricePerSeat * employeeCount,
    nextMonthlyTotal: pricePerSeat * employeeCount + (planInfo.addOnPrice ?? 0),
  })
}
