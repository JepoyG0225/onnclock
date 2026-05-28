import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createSingleTransfer } from '@/lib/payments/paymongo'
import { disbursementChannel, lookupBic } from '@/lib/ph-bank-bics'
import { checkHrisProAccess } from '@/lib/feature-gates'

/** Resolve effective BIC: use stored bankBic, or fall back to lookup by bank name. */
function resolveBic(bankBic: string | null, bankName: string | null): string | null {
  if (bankBic) return bankBic
  if (bankName) return lookupBic(bankName) ?? null
  return null
}
import { nanoid } from 'nanoid'

/** ₱15 processing fee charged per employee transfer */
export const DISBURSEMENT_FEE_PER_TRANSFER = 15


/**
 * GET /api/disbursement/[runId]
 * Returns a preview of the disbursement for a payroll run.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const hasAccess = await checkHrisProAccess(ctx.companyId)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Disbursement requires the Pro plan.' }, { status: 403 })
  }

  const [run, company] = await Promise.all([
    prisma.payrollRun.findFirst({
      where: { id: runId, companyId: ctx.companyId },
      include: { disbursement: { include: { items: true } } },
    }),
    prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { disbursementBalance: true },
    }),
  ])

  if (!run)     return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  if (!company) return NextResponse.json({ error: 'Company not found' },    { status: 404 })

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    select: {
      id: true,
      netPay: true,
      employee: {
        select: {
          id: true, firstName: true, lastName: true,
          bankName: true, bankAccountNo: true, bankBic: true,
        },
      },
    },
    orderBy: { employee: { lastName: 'asc' } },
  })

  const items = payslips.map(ps => {
    const amount      = ps.netPay.toNumber()
    const effectiveBic = resolveBic(ps.employee.bankBic, ps.employee.bankName)
    const hasBankDetails = !!(ps.employee.bankAccountNo && effectiveBic)
    return {
      payslipId:     ps.id,
      employeeId:    ps.employee.id,
      employeeName:  `${ps.employee.lastName}, ${ps.employee.firstName}`,
      bankName:      ps.employee.bankName ?? null,
      bankAccountNo: ps.employee.bankAccountNo ?? null,
      bankBic:       effectiveBic,
      amount,
      channel:       disbursementChannel(amount),
      hasBankDetails,
      status:        run.disbursement?.items.find(i => i.payslipId === ps.id)?.status ?? null,
      referenceNo:   run.disbursement?.items.find(i => i.payslipId === ps.id)?.referenceNo ?? null,
    }
  })

  const readyCount  = items.filter(i => i.hasBankDetails).length
  const netPayTotal = items.filter(i => i.hasBankDetails).reduce((s, i) => s + i.amount, 0)
  const totalFees   = readyCount * DISBURSEMENT_FEE_PER_TRANSFER
  const totalCost   = netPayTotal + totalFees
  const balance     = company.disbursementBalance.toNumber()

  return NextResponse.json({
    run: {
      id: run.id,
      periodLabel: run.periodLabel,
      status: run.status,
      totalNetPay: run.totalNetPay.toNumber(),
    },
    wallet: {
      balance,
      sufficient: balance >= totalCost,
      needed:     totalCost,
      shortfall:  Math.max(0, totalCost - balance),
    },
    fees: {
      perTransfer: DISBURSEMENT_FEE_PER_TRANSFER,
      count:       readyCount,
      total:       totalFees,
    },
    summary: {
      totalEmployees:     items.length,
      readyCount,
      missingBankDetails: items.length - readyCount,
      netPayTotal,
      totalFees,
      totalCost,
      instapayCount: items.filter(i => i.hasBankDetails && i.channel === 'instapay').length,
      pesonetCount:  items.filter(i => i.hasBankDetails && i.channel === 'pesonet').length,
    },
    items,
    disbursement: run.disbursement
      ? {
          id:              run.disbursement.id,
          status:          run.disbursement.status,
          batchTransferId: run.disbursement.batchTransferId,
          initiatedAt:     run.disbursement.initiatedAt,
          completedAt:     run.disbursement.completedAt,
          totalAmount:     run.disbursement.totalAmount.toNumber(),
        }
      : null,
  })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[disbursement GET]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/disbursement/[runId]
 * Initiates a disbursement batch. Deducts net pay + ₱15/transfer fees from wallet.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const hasAccess = await checkHrisProAccess(ctx.companyId)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Disbursement requires the Pro plan.' }, { status: 403 })
  }

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
    include: { disbursement: true },
  })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

  if (!['APPROVED', 'LOCKED'].includes(run.status)) {
    return NextResponse.json({ error: 'Payroll run must be APPROVED or LOCKED to disburse' }, { status: 400 })
  }
  if (run.disbursement) {
    // A fully-failed disbursement refunded the wallet already — delete it so
    // the user can start a fresh attempt rather than hitting a permanent 409.
    if (run.disbursement.status === 'FAILED') {
      await prisma.$transaction([
        prisma.payrollDisbursementItem.deleteMany({ where: { disbursementId: run.disbursement.id } }),
        prisma.payrollDisbursement.delete({ where: { id: run.disbursement.id } }),
      ])
    } else {
      const hint =
        run.disbursement.status === 'PROCESSING'
          ? 'Disbursement is currently processing — please wait for it to finish.'
          : run.disbursement.status === 'PARTIAL'
          ? 'Some transfers failed. Use the Retry button to re-send only the failed ones.'
          : 'Disbursement already completed for this run.'
      return NextResponse.json({ error: hint }, { status: 409 })
    }
  }

  const company = await prisma.company.findUnique({
    where: { id: ctx.companyId },
    select: { name: true, disbursementBalance: true },
  })
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    select: {
      id: true,
      netPay: true,
      employee: {
        select: {
          id: true, firstName: true, lastName: true,
          bankName: true, bankAccountNo: true, bankBic: true,
        },
      },
    },
  })

  const disbursable = payslips.filter(ps =>
    ps.employee.bankAccountNo && resolveBic(ps.employee.bankBic, ps.employee.bankName),
  )
  if (disbursable.length === 0) {
    return NextResponse.json(
      { error: 'No employees have complete bank details (account number + bank name). Please update employee profiles.' },
      { status: 400 },
    )
  }

  const netPayTotal = disbursable.reduce((s, ps) => s + ps.netPay.toNumber(), 0)
  const totalFees   = disbursable.length * DISBURSEMENT_FEE_PER_TRANSFER
  const totalCost   = netPayTotal + totalFees
  const balance     = company.disbursementBalance.toNumber()

  if (balance < totalCost) {
    return NextResponse.json(
      {
        error: `Insufficient wallet balance. Balance: ₱${balance.toFixed(2)}, Required: ₱${totalCost.toFixed(2)} (net pay ₱${netPayTotal.toFixed(2)} + fees ₱${totalFees.toFixed(2)})`,
      },
      { status: 400 },
    )
  }

  const transferItems = disbursable.map(ps => {
    const amount       = ps.netPay.toNumber()
    const effectiveBic = resolveBic(ps.employee.bankBic, ps.employee.bankName)!
    return {
      destinationAccount: {
        number: ps.employee.bankAccountNo!,
        name:   `${ps.employee.firstName} ${ps.employee.lastName}`,
        bic:    effectiveBic,
      },
      amountCentavos:  Math.round(amount * 100),
      provider:        disbursementChannel(amount) as 'instapay' | 'pesonet',
      referenceNumber: `${runId.slice(-8)}-${ps.id.slice(-6)}`,
      description:     `Payroll — ${run.periodLabel}`,
    }
  })

  const disbursementId = nanoid()

  // Deduct net pay + fees from wallet atomically before hitting PayMongo
  await prisma.$transaction([
    prisma.payrollDisbursement.create({
      data: {
        id:           disbursementId,
        companyId:    ctx.companyId,
        payrollRunId: runId,
        totalAmount:  netPayTotal,
        status:       'PROCESSING',
        initiatedBy:  ctx.userId,
        notes:        JSON.stringify({ totalFees, feePerTransfer: DISBURSEMENT_FEE_PER_TRANSFER }),
        items: {
          create: disbursable.map(ps => ({
            id:            nanoid(),
            payslipId:     ps.id,
            employeeId:    ps.employee.id,
            employeeName:  `${ps.employee.lastName}, ${ps.employee.firstName}`,
            bankName:      ps.employee.bankName ?? null,
            bankAccountNo: ps.employee.bankAccountNo!,
            bankBic:       resolveBic(ps.employee.bankBic, ps.employee.bankName)!,
            amount:        ps.netPay.toNumber(),
            channel:       disbursementChannel(ps.netPay.toNumber()),
            status:        'PROCESSING',
          })),
        },
      },
    }),
    prisma.company.update({
      where: { id: ctx.companyId },
      data:  { disbursementBalance: { decrement: totalCost } },  // net pay + fees
    }),
  ])

  // ── Sequential send-money: one API call per employee ─────────────────────
  // Each employee's transfer is submitted individually so failures are isolated.
  // Items are updated in-place as each call settles.

  // Fetch the created items so we have their IDs for updates
  const createdItems = await prisma.payrollDisbursementItem.findMany({
    where:   { disbursementId },
    select:  { id: true, payslipId: true },
  })
  const itemById = Object.fromEntries(createdItems.map(i => [i.payslipId, i.id]))

  let completedCount = 0
  let failedCount    = 0

  for (let idx = 0; idx < transferItems.length; idx++) {
    const transferItem = transferItems[idx]!
    const ps           = disbursable[idx]!
    const dbItemId     = itemById[ps.id]!

    try {
      const result = await createSingleTransfer(transferItem, idx)

      // PayMongo batch_transfers returns 'pending' initially — settlement is async.
      // Any non-error response means the transfer was successfully submitted.
      // Only treat it as failed if PayMongo explicitly says so.
      const itemStatus = result.status === 'failed' ? 'FAILED' : 'COMPLETED'
      if (itemStatus === 'COMPLETED') completedCount++
      else failedCount++

      await prisma.payrollDisbursementItem.update({
        where: { id: dbItemId },
        data: {
          pmTransferId:  result.pmTransferId,
          status:        itemStatus,
          referenceNo:   result.providerReferenceNumber ?? result.referenceNumber ?? null,
          failureReason: itemStatus === 'FAILED' ? (result.error ?? 'PayMongo rejected transfer') : null,
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PayMongo error'
      failedCount++
      await prisma.payrollDisbursementItem.update({
        where: { id: dbItemId },
        data: { status: 'FAILED', failureReason: msg },
      })
    }
  }

  // Determine overall disbursement status
  const processingCount = transferItems.length - completedCount - failedCount
  const overallStatus   =
    processingCount > 0              ? 'PROCESSING' :
    failedCount === 0                ? 'COMPLETED'  :
    completedCount === 0             ? 'FAILED'     :
                                       'PARTIAL'

  await prisma.payrollDisbursement.update({
    where: { id: disbursementId },
    data: {
      status:      overallStatus,
      completedAt: processingCount === 0 ? new Date() : undefined,
    },
  })

  // If everything failed outright, refund the wallet
  if (overallStatus === 'FAILED') {
    await prisma.company.update({
      where: { id: ctx.companyId },
      data:  { disbursementBalance: { increment: totalCost } },
    })
    return NextResponse.json(
      { error: 'All transfers failed. Wallet has been refunded. You can try disbursing again.' },
      { status: 422 },
    )
  }

  return NextResponse.json({
    disbursementId,
    status: overallStatus,
    netPayTotal,
    totalFees,
    totalCost,
    employeeCount:   disbursable.length,
    completedCount,
    failedCount,
    processingCount,
  }, { status: 201 })
}
