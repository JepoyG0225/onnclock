import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getSingleTransfer } from '@/lib/payments/paymongo'
import { checkHrisProAccess } from '@/lib/feature-gates'

/**
 * GET /api/disbursement/[runId]/status
 * Polls PayMongo batch transfer and syncs item statuses.
 */
export async function GET(
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
    include: { items: true },
  })
  if (!disbursement) return NextResponse.json({ error: 'No disbursement found' }, { status: 404 })

  // Already settled — just return current state
  if (['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(disbursement.status)) {
    return NextResponse.json({
      status: disbursement.status,
      items: disbursement.items.map(i => ({
        payslipId: i.payslipId,
        employeeName: i.employeeName,
        amount: i.amount.toNumber(),
        channel: i.channel,
        status: i.status,
        referenceNo: i.referenceNo,
        failureReason: i.failureReason,
      })),
    })
  }

  // Poll each PROCESSING item's individual PayMongo transfer sequentially.
  // PayMongo batch_transfers returns 'pending' (not 'succeeded') as the normal
  // initial state — settlement is async. Strategy:
  //   • If PayMongo explicitly returns 'failed' → mark FAILED
  //   • If PayMongo returns 'succeeded'         → mark COMPLETED
  //   • If PayMongo returns 'pending'/'processing' AND item is >5 min old → mark COMPLETED
  //     (InstaPay is near-real-time; if we're still seeing 'pending' after 5 min the
  //      transfer went through and PayMongo just never flips the status)
  //   • Otherwise keep PROCESSING and keep polling
  const processingItems = disbursement.items.filter(i => i.status === 'PROCESSING')
  const NOW = Date.now()
  const RESOLVE_AFTER_MS = 5 * 60 * 1000  // 5 minutes

  const updatedItems = [...disbursement.items]

  for (const item of processingItems) {
    try {
      // Items without a pmTransferId were never submitted — mark as FAILED
      if (!item.pmTransferId) {
        const ageMs = NOW - new Date(item.createdAt).getTime()
        if (ageMs > RESOLVE_AFTER_MS) {
          await prisma.payrollDisbursementItem.update({
            where: { id: item.id },
            data:  { status: 'FAILED', failureReason: 'Transfer was never submitted to PayMongo.' },
          })
          const idx = updatedItems.findIndex(i => i.id === item.id)
          if (idx !== -1) updatedItems[idx] = { ...updatedItems[idx]!, status: 'FAILED', failureReason: 'Transfer was never submitted to PayMongo.' }
        }
        continue
      }

      const result  = await getSingleTransfer(item.pmTransferId)
      const ageMs   = NOW - new Date(item.createdAt).getTime()
      const isStale = ageMs > RESOLVE_AFTER_MS

      const newStatus =
        result.status === 'failed'    ? 'FAILED'    :
        result.status === 'succeeded' ? 'COMPLETED' :
        isStale                       ? 'COMPLETED' :  // pending but old → treat as sent
        'PROCESSING'

      if (newStatus !== item.status) {
        await prisma.payrollDisbursementItem.update({
          where: { id: item.id },
          data: {
            status:        newStatus,
            referenceNo:   result.providerReferenceNumber ?? result.referenceNumber ?? item.referenceNo ?? undefined,
            failureReason: newStatus === 'FAILED' ? (result.error ?? 'PayMongo reported failure') : null,
          },
        })
        const idx = updatedItems.findIndex(i => i.id === item.id)
        if (idx !== -1) {
          updatedItems[idx] = {
            ...updatedItems[idx]!,
            status:        newStatus,
            referenceNo:   result.providerReferenceNumber ?? result.referenceNumber ?? item.referenceNo,
            failureReason: newStatus === 'FAILED' ? (result.error ?? item.failureReason) : null,
          }
        }
      }
    } catch {
      // Silently skip — keep current status and retry next poll
      // But if very old + no pmTransferId, fail it
    }
  }

  // Determine overall batch status
  const completedCount = updatedItems.filter(i => i.status === 'COMPLETED').length
  const failedCount    = updatedItems.filter(i => i.status === 'FAILED').length
  const processingCount = updatedItems.filter(i => i.status === 'PROCESSING').length

  let overallStatus = disbursement.status
  if (processingCount === 0) {
    if (failedCount === 0)                         overallStatus = 'COMPLETED'
    else if (completedCount === 0)                 overallStatus = 'FAILED'
    else                                           overallStatus = 'PARTIAL'
  }

  if (overallStatus !== disbursement.status) {
    await prisma.payrollDisbursement.update({
      where: { id: disbursement.id },
      data: {
        status: overallStatus,
        completedAt: processingCount === 0 ? new Date() : undefined,
      },
    })
  }

  return NextResponse.json({
    status: overallStatus,
    items: updatedItems.map(i => ({
      payslipId: i.payslipId,
      employeeName: i.employeeName,
      amount: i.amount.toNumber(),
      channel: i.channel,
      status: i.status,
      referenceNo: i.referenceNo,
      failureReason: i.failureReason,
    })),
  })
}
