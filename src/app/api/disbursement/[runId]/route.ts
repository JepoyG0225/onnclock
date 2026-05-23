import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createBatchTransfer } from '@/lib/payments/paymongo'
import { disbursementChannel } from '@/lib/ph-bank-bics'
import { nanoid } from 'nanoid'

// PayMongo e-wallet is the fixed source — configured per-environment, not per-company.
function pmSource(companyName: string) {
  return {
    number: process.env.PAYMONGO_SOURCE_ACCOUNT_NO ?? '',
    name:   process.env.PAYMONGO_SOURCE_ACCOUNT_NAME ?? companyName,
    bic:    process.env.PAYMONGO_SOURCE_BIC ?? 'PAEYPHM2XXX',
  }
}

/**
 * GET /api/disbursement/[runId]
 * Returns a preview of the disbursement for a payroll run.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

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
    const amount = ps.netPay.toNumber()
    const hasBankDetails = !!(ps.employee.bankAccountNo && ps.employee.bankBic)
    return {
      payslipId:    ps.id,
      employeeId:   ps.employee.id,
      employeeName: `${ps.employee.lastName}, ${ps.employee.firstName}`,
      bankName:     ps.employee.bankName ?? null,
      bankAccountNo: ps.employee.bankAccountNo ?? null,
      bankBic:      ps.employee.bankBic ?? null,
      amount,
      channel:      disbursementChannel(amount),
      hasBankDetails,
      status:       run.disbursement?.items.find(i => i.payslipId === ps.id)?.status ?? null,
      referenceNo:  run.disbursement?.items.find(i => i.payslipId === ps.id)?.referenceNo ?? null,
    }
  })

  const readyCount  = items.filter(i => i.hasBankDetails).length
  const totalAmount = items.filter(i => i.hasBankDetails).reduce((s, i) => s + i.amount, 0)
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
      sufficient: balance >= totalAmount,
      needed:     totalAmount,
      shortfall:  Math.max(0, totalAmount - balance),
    },
    summary: {
      totalEmployees:    items.length,
      readyCount,
      missingBankDetails: items.length - readyCount,
      totalAmount,
      instapayCount: items.filter(i => i.hasBankDetails && i.channel === 'instapay').length,
      pesonetCount:  items.filter(i => i.hasBankDetails && i.channel === 'pesonet').length,
    },
    items,
    disbursement: run.disbursement
      ? {
          id:             run.disbursement.id,
          status:         run.disbursement.status,
          batchTransferId: run.disbursement.batchTransferId,
          initiatedAt:    run.disbursement.initiatedAt,
          completedAt:    run.disbursement.completedAt,
          totalAmount:    run.disbursement.totalAmount.toNumber(),
        }
      : null,
  })
}

/**
 * POST /api/disbursement/[runId]
 * Initiates a disbursement batch. Deducts from wallet and calls PayMongo.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId: ctx.companyId },
    include: { disbursement: true },
  })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

  if (!['APPROVED', 'LOCKED'].includes(run.status)) {
    return NextResponse.json({ error: 'Payroll run must be APPROVED or LOCKED to disburse' }, { status: 400 })
  }
  if (run.disbursement) {
    return NextResponse.json({ error: 'Disbursement already initiated for this run' }, { status: 409 })
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

  const disbursable = payslips.filter(ps => ps.employee.bankAccountNo && ps.employee.bankBic)
  if (disbursable.length === 0) {
    return NextResponse.json(
      { error: 'No employees have complete bank details (account number + BIC). Please update employee profiles.' },
      { status: 400 },
    )
  }

  const totalAmount = disbursable.reduce((s, ps) => s + ps.netPay.toNumber(), 0)
  const balance     = company.disbursementBalance.toNumber()

  if (balance < totalAmount) {
    return NextResponse.json(
      { error: `Insufficient wallet balance. Balance: ₱${balance.toFixed(2)}, Required: ₱${totalAmount.toFixed(2)}` },
      { status: 400 },
    )
  }

  const source = pmSource(company.name)

  const transferItems = disbursable.map(ps => {
    const amount = ps.netPay.toNumber()
    return {
      sourceAccount:      source,
      destinationAccount: {
        number: ps.employee.bankAccountNo!,
        name:   `${ps.employee.firstName} ${ps.employee.lastName}`,
        bic:    ps.employee.bankBic!,
      },
      amountCentavos:  Math.round(amount * 100),
      provider:        disbursementChannel(amount) as 'instapay' | 'pesonet',
      referenceNumber: `${runId.slice(-8)}-${ps.id.slice(-6)}`,
      description:     `Payroll — ${run.periodLabel}`,
    }
  })

  const disbursementId = nanoid()

  await prisma.$transaction([
    prisma.payrollDisbursement.create({
      data: {
        id:          disbursementId,
        companyId:   ctx.companyId,
        payrollRunId: runId,
        totalAmount,
        status:      'PROCESSING',
        initiatedBy: ctx.userId,
        items: {
          create: disbursable.map(ps => ({
            id:           nanoid(),
            payslipId:    ps.id,
            employeeId:   ps.employee.id,
            employeeName: `${ps.employee.lastName}, ${ps.employee.firstName}`,
            bankName:     ps.employee.bankName ?? null,
            bankAccountNo: ps.employee.bankAccountNo!,
            bankBic:      ps.employee.bankBic!,
            amount:       ps.netPay.toNumber(),
            channel:      disbursementChannel(ps.netPay.toNumber()),
            status:       'PROCESSING',
          })),
        },
      },
    }),
    prisma.company.update({
      where: { id: ctx.companyId },
      data:  { disbursementBalance: { decrement: totalAmount } },
    }),
  ])

  let batchId = ''
  try {
    const batch = await createBatchTransfer(transferItems)
    batchId = batch.id
    await prisma.payrollDisbursement.update({
      where: { id: disbursementId },
      data:  { batchTransferId: batchId },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'PayMongo error'
    await prisma.payrollDisbursement.update({
      where: { id: disbursementId },
      data:  { status: 'FAILED', notes: msg },
    })
    await prisma.company.update({
      where: { id: ctx.companyId },
      data:  { disbursementBalance: { increment: totalAmount } },
    })
    return NextResponse.json({ error: `Disbursement failed: ${msg}` }, { status: 502 })
  }

  return NextResponse.json({
    disbursementId,
    batchTransferId: batchId,
    status:          'PROCESSING',
    totalAmount,
    employeeCount:   disbursable.length,
  }, { status: 201 })
}
