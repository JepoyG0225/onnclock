import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createSingleTransfer } from '@/lib/payments/paymongo'
import { disbursementChannel } from '@/lib/ph-bank-bics'
import { checkHrisProAccess } from '@/lib/feature-gates'


/**
 * POST /api/disbursement/[runId]/retry
 * Re-submits only the FAILED items in an existing disbursement.
 * Does NOT deduct from the wallet again — funds were already held.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const hasAccess = await checkHrisProAccess(ctx.companyId)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Disbursement requires the Pro plan.' }, { status: 403 })
  }

  const disbursement = await prisma.payrollDisbursement.findFirst({
    where: { payrollRunId: runId, companyId: ctx.companyId },
    include: {
      items: true,
      payrollRun: { select: { periodLabel: true } },
    },
  })

  if (!disbursement) {
    return NextResponse.json({ error: 'No disbursement found for this run.' }, { status: 404 })
  }

  if (!['FAILED', 'PARTIAL', 'PROCESSING'].includes(disbursement.status)) {
    return NextResponse.json(
      { error: 'Only FAILED, PARTIAL, or stuck PROCESSING disbursements can be retried.' },
      { status: 400 },
    )
  }

  // Treat PROCESSING items as FAILED too — they may be stuck from a prior attempt
  // where the batch call threw before PayMongo could accept them.
  const failedItems = disbursement.items.filter(i => i.status === 'FAILED' || i.status === 'PROCESSING')
  if (failedItems.length === 0) {
    return NextResponse.json({ error: 'No failed items to retry.' }, { status: 400 })
  }

  const transferItems = failedItems.map(item => ({
    destinationAccount: {
      number: item.bankAccountNo ?? '',
      name:   item.employeeName,
      bic:    item.bankBic ?? '',
    },
    amountCentavos:  Math.round(item.amount.toNumber() * 100),
    provider:        disbursementChannel(item.amount.toNumber()) as 'instapay' | 'pesonet',
    referenceNumber: item.referenceNo ?? `retry-${item.id.slice(-8)}`,
    description:     `Payroll Retry — ${disbursement.payrollRun.periodLabel}`,
  }))

  // Reset to PROCESSING upfront
  await prisma.$transaction([
    prisma.payrollDisbursement.update({
      where: { id: disbursement.id },
      data:  { status: 'PROCESSING' },
    }),
    ...failedItems.map(item =>
      prisma.payrollDisbursementItem.update({
        where: { id: item.id },
        data:  { status: 'PROCESSING', failureReason: null },
      }),
    ),
  ])

  // Sequential send-money: one call per failed employee
  let completedCount = 0
  let failedCount    = 0
  const failureReasons: string[] = []

  for (let idx = 0; idx < failedItems.length; idx++) {
    const item         = failedItems[idx]!
    const transferItem = transferItems[idx]!

    let transferResult: Awaited<ReturnType<typeof createSingleTransfer>> | null = null
    try {
      transferResult = await createSingleTransfer(transferItem, idx)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PayMongo transfer error'
      console.error('[disbursement retry] createSingleTransfer threw:', msg, e)
      failedCount++
      failureReasons.push(`${item.employeeName}: ${msg}`)
      await prisma.payrollDisbursementItem.update({
        where: { id: item.id },
        data:  { status: 'FAILED', failureReason: msg },
      })
      continue
    }

    try {
      // PayMongo returns 'pending' initially — settlement is async.
      // Any non-error response = successfully submitted = COMPLETED on our side.
      const itemStatus = transferResult.status === 'failed' ? 'FAILED' : 'COMPLETED'
      if (itemStatus === 'COMPLETED') completedCount++
      else failedCount++
      await prisma.payrollDisbursementItem.update({
        where: { id: item.id },
        data: {
          pmTransferId:  transferResult.pmTransferId,
          status:        itemStatus,
          referenceNo:   transferResult.providerReferenceNumber ?? transferResult.referenceNumber ?? null,
          failureReason: itemStatus === 'FAILED' ? (transferResult.error ?? 'PayMongo rejected transfer') : null,
        },
      })
    } catch (e) {
      // Transfer succeeded but DB update failed — still count as completed
      // so we don't retry and double-pay
      const msg = e instanceof Error ? e.message : 'DB update error'
      console.error('[disbursement retry] DB update threw after successful transfer:', msg, e)
      completedCount++
      failureReasons.push(`${item.employeeName} (DB update failed): ${msg}`)
    }
  }

  const processingCount = failedItems.length - completedCount - failedCount
  const overallStatus =
    processingCount > 0  ? 'PROCESSING' :
    failedCount === 0    ? 'COMPLETED'  :
    completedCount === 0 ? 'FAILED'     :
                           'PARTIAL'

  // Factor in any items that were already COMPLETED before this retry
  const alreadyCompleted = disbursement.items.filter(
    i => !failedItems.find(f => f.id === i.id) && i.status === 'COMPLETED',
  ).length
  const anyCompleted = completedCount + alreadyCompleted > 0
  const finalStatus =
    processingCount > 0 ? 'PROCESSING' :
    failedCount === 0   ? 'COMPLETED'  :
    anyCompleted        ? 'PARTIAL'    :
                          'FAILED'

  await prisma.payrollDisbursement.update({
    where: { id: disbursement.id },
    data: {
      status:      finalStatus,
      completedAt: processingCount === 0 ? new Date() : undefined,
    },
  })

  return NextResponse.json({ status: finalStatus, retried: failedItems.length, completedCount, failedCount, failureReasons })
}
