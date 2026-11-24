import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { provider, ProviderError, batchState, transferState, sameTransferReference } from './provider'
import { readyWallet } from './wallet'
import { disbursementChannel, lookupBic } from '@/lib/ph-bank-bics'

interface Transfer {
  id: string; status: string; amount: number; fee?: number; reference_number?: string
  provider_reference_number?: string; error?: string
}
export async function refreshBatch(id: string) {
  const items = await prisma.payrollDisbursementItem.findMany({ where: { disbursementId: id }, select: { status: true } })
  const status = batchState(items.map(i => i.status))
  await prisma.payrollDisbursement.update({ where: { id }, data: { status, completedAt: status === 'PROCESSING' ? null : new Date() } })
  return status
}
export async function sendLinkedPayroll(companyId: string, userId: string, runId: string, retry = false) {
  const ready = await readyWallet(companyId)
  const accountId = ready.saved.accountId!
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId },
    include: { disbursement: { include: { items: true } } },
  })
  if (!run || !['APPROVED', 'LOCKED'].includes(run.status)) throw new Error('An approved or locked company payroll is required.')
  let disbursement = run.disbursement
  if (retry) {
    if (!disbursement || disbursement.pmAccountId !== accountId) throw new Error('Legacy transfers require reconciliation; they cannot be retried from a linked wallet.')
  } else {
    if (disbursement) throw new Error('A disbursement already exists. Refresh its status and retry only confirmed failures.')
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: runId }, include: { employee: true },
    })
    if (!payslips.length) throw new Error('No payslips are available.')
    if (payslips.some(p => Number(p.netPay) <= 0 || !p.employee.bankAccountNo || !(p.employee.bankBic || lookupBic(p.employee.bankName ?? '')))) throw new Error('Every employee must have positive net pay and valid bank details before disbursement.')
    const totalCentavos = payslips.reduce((sum, p) => sum + Math.round(Number(p.netPay) * 100), 0)
    if (ready.wallet.balance.available < totalCentavos) throw new Error('Insufficient available PayMongo wallet balance. Allow additional funds for provider fees.')
    // Unique payrollRunId and payslipId constraints make simultaneous submissions
    // mutually exclusive, before either request can reach PayMongo.
    disbursement = await prisma.payrollDisbursement.create({
      data: {
        companyId, payrollRunId: runId, pmAccountId: accountId, totalAmount: totalCentavos / 100,
        status: 'PROCESSING', initiatedBy: userId,
        notes: 'Company-linked wallet. PayMongo charges its contracted transfer fees directly.',
        items: { create: payslips.map(p => ({
          payslipId: p.id, employeeId: p.employeeId,
          employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
          bankName: p.employee.bankName, bankAccountNo: p.employee.bankAccountNo,
          bankBic: p.employee.bankBic || lookupBic(p.employee.bankName ?? ''),
          amount: p.netPay, channel: disbursementChannel(Number(p.netPay)), status: 'PENDING',
        })) },
      }, include: { items: true },
    })
  }
  const eligible = disbursement!.items.filter(i => i.status === 'PENDING' || i.status === 'FAILED')
  if (!eligible.length) throw new Error('No unsent or confirmed failed transfers are available. Pending outcomes cannot be resent.')
  for (const item of eligible) {
    const key = randomUUID()
    const payload = { transfers: [{
      source_account: ready.sourceAccount,
      destination_account: { number: item.bankAccountNo, name: item.employeeName, bic: item.bankBic },
      amount: Math.round(Number(item.amount) * 100), currency: 'PHP', provider: item.channel,
      purpose: 'Disbursement', description: `Payroll ${run.periodLabel}`,
      reference_number: key,
    }] }
    const attempt = await prisma.$transaction(async tx => {
      const latest = await tx.disbursementTransferAttempt.findFirst({ where: { itemId: item.id }, orderBy: { createdAt: 'desc' } })
      // A legacy FAILED flag alone is insufficient evidence that retry is safe.
      if (item.status === 'FAILED' && latest?.status !== 'FAILED') return null
      const claimed = await tx.payrollDisbursementItem.updateMany({
        where: { id: item.id, status: item.status },
        data: { status: 'PROCESSING', failureReason: null, pmTransferId: null },
      })
      if (!claimed.count) return null
      return tx.disbursementTransferAttempt.create({
        data: { itemId: item.id, accountId, idempotencyKey: key, payload: payload as Prisma.InputJsonValue },
      })
    })
    if (!attempt) continue
    let result: { data: { id: string; transfers: Transfer[] } }
    try {
      result = await provider('POST', '/v2/batch_transfers', { accountId, body: payload, idempotencyKey: key })
    } catch (e) {
      // Timeouts, rate limits and ambiguous server errors may have accepted funds.
      // Only explicit validation/auth rejections establish a failed attempt.
      const rejected = e instanceof ProviderError && [400, 401, 403, 422].includes(e.status)
      const status = rejected ? 'FAILED' : 'PROCESSING'
      const message = rejected ? e.message : 'Transfer outcome is unconfirmed. Reconcile with PayMongo before any retry.'
      await prisma.$transaction([
        prisma.disbursementTransferAttempt.update({ where: { id: attempt.id }, data: { status, error: message } }),
        prisma.payrollDisbursementItem.update({ where: { id: item.id }, data: { status, failureReason: message } }),
      ])
      continue
    }
    const transfer = result.data?.transfers?.[0]
    if (!result.data?.id || !transfer?.id || transfer.amount !== payload.transfers[0].amount) {
      await prisma.disbursementTransferAttempt.update({ where: { id: attempt.id }, data: {
        batchId: result.data?.id, error: 'Incomplete or inconsistent provider response. Reconciliation required.',
      } })
      continue
    }
    const status = transferState(transfer.status)
    // If this transaction fails, the attempt stays PROCESSING and cannot be retried.
    await prisma.$transaction([
      prisma.disbursementTransferAttempt.update({ where: { id: attempt.id }, data: {
        status, batchId: result.data.id, transferId: transfer.id, feeCentavos: transfer.fee,
        error: status === 'FAILED' ? String(transfer.error ?? 'PayMongo rejected transfer.') : null,
      } }),
      prisma.payrollDisbursementItem.update({ where: { id: item.id }, data: {
        pmTransferId: transfer.id, status, referenceNo: transfer.provider_reference_number ?? transfer.reference_number,
        failureReason: status === 'FAILED' ? String(transfer.error ?? 'PayMongo rejected transfer.') : null,
      } }),
    ])
  }
  return { disbursementId: disbursement!.id, status: await refreshBatch(disbursement!.id) }
}
export async function pollLinkedTransfers(companyId: string, runId: string) {
  const batch = await prisma.payrollDisbursement.findFirst({ where: { companyId, payrollRunId: runId }, include: { items: { include: { attempts: true } } } })
  if (!batch?.pmAccountId) return null
  const wallet = await prisma.companyPaymongoWallet.findUnique({ where: { companyId } })
  if (!wallet || wallet.accountId !== batch.pmAccountId) throw new Error('Linked account mismatch.')
  const { providerMode } = await import('./provider')
  if (wallet.livemode !== providerMode()) throw new Error('PayMongo mode mismatch.')
  const deadline = Date.now() + 20000
  const ordered = [...batch.items].sort((a, b) => {
    const age = (x: typeof a) => Math.max(0, ...x.attempts.map(t => +t.updatedAt))
    return age(a) - age(b)
  })
  for (const item of ordered) {
    if (Date.now() > deadline) break
    if (item.status !== 'PROCESSING') continue
    const attempt = item.attempts.find(a => a.status === 'PROCESSING' && a.batchId)
    if (!attempt) continue
    const result = await provider<{ data: { id: string; transfers: Transfer[] } }>('GET', `/v2/batch_transfers/${attempt.batchId}`, { accountId: batch.pmAccountId })
    const transfer = result.data?.transfers?.find(t => attempt.transferId ? t.id === attempt.transferId : sameTransferReference(t.reference_number, attempt.idempotencyKey))
    if (!transfer || transfer.amount !== Math.round(Number(item.amount) * 100) || !sameTransferReference(transfer.reference_number, attempt.idempotencyKey)) throw new Error('Transfer reconciliation mismatch.')
    const status = transferState(transfer.status)
    await prisma.$transaction([
      prisma.disbursementTransferAttempt.updateMany({ where: { id: attempt.id, status: 'PROCESSING' }, data: { status, transferId: transfer.id, feeCentavos: transfer.fee } }),
      prisma.payrollDisbursementItem.updateMany({ where: { id: item.id, status: 'PROCESSING', pmTransferId: item.pmTransferId }, data: {
        status, pmTransferId: transfer.id, referenceNo: transfer.provider_reference_number ?? transfer.reference_number,
        failureReason: status === 'FAILED' ? String(transfer.error ?? 'PayMongo reported failure.') : null,
      } }),
    ])
  }
  await refreshBatch(batch.id)
  return prisma.payrollDisbursement.findUniqueOrThrow({ where: { id: batch.id }, include: { items: true } })
}
