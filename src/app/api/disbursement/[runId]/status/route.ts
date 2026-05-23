import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getBatchTransfer } from '@/lib/payments/paymongo'

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

  // No batch ID yet — still local-only
  if (!disbursement.batchTransferId) {
    return NextResponse.json({ status: disbursement.status, items: [] })
  }

  // Poll PayMongo
  let batch
  try {
    batch = await getBatchTransfer(disbursement.batchTransferId)
  } catch {
    return NextResponse.json({ status: disbursement.status, items: disbursement.items })
  }

  // Map PayMongo transfer statuses back to our items by index
  const updatedItems = disbursement.items.map((item, idx) => {
    const pmTransfer = batch.transfers[idx]
    if (!pmTransfer) return item
    const newStatus =
      pmTransfer.status === 'succeeded' ? 'COMPLETED' :
      pmTransfer.status === 'failed'    ? 'FAILED'    :
      'PROCESSING'
    return {
      ...item,
      status: newStatus,
      referenceNo: pmTransfer.providerReferenceNumber ?? pmTransfer.referenceNumber ?? item.referenceNo,
      failureReason: pmTransfer.error ?? item.failureReason,
    }
  })

  // Persist updated statuses
  await Promise.all(
    updatedItems
      .filter((item, idx) => item.status !== disbursement.items[idx].status)
      .map(item =>
        prisma.payrollDisbursementItem.update({
          where: { id: item.id },
          data: {
            status: item.status,
            referenceNo: item.referenceNo ?? undefined,
            failureReason: item.failureReason ?? undefined,
          },
        }),
      ),
  )

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
