/**
 * POST /api/admin/proposal/send — generate the proposal PDF and email it to the
 * client with a message. SUPER_ADMIN only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { buildProposalPdf, computeProposalTotals, type ProposalData } from '@/lib/proposals/pdf'
import { sendProposalEmail } from '@/lib/mailer'

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const body = (await req.json()) as { proposal: ProposalData; to?: string; subject?: string; message?: string }
  const data = body.proposal
  const to = (body.to ?? data?.clientEmail ?? '').trim()

  if (!data?.clientCompany?.trim()) {
    return NextResponse.json({ error: 'Client company is required' }, { status: 400 })
  }
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: 'A valid recipient email is required' }, { status: 400 })
  }

  const proposal: ProposalData = { ...data, customItems: Array.isArray(data.customItems) ? data.customItems : [] }
  const totals = computeProposalTotals(proposal)
  const bytes = await buildProposalPdf(proposal)

  const subject = body.subject?.trim() || `OnClock Proposal & Quotation — ${proposal.quoteNo}`
  const message = body.message?.trim() || [
    `Hi${proposal.clientContact ? ' ' + proposal.clientContact : ''},`,
    '',
    `Thank you for your interest in OnClock HR & Payroll. Please find attached our proposal and quotation (${proposal.quoteNo}) for ${proposal.clientCompany}.`,
    '',
    `Indicative pricing for ${proposal.seats} employees: Basic at PHP ${totals.basicMonthlyTotal.toLocaleString('en-PH')}/month and Pro at PHP ${totals.proMonthlyTotal.toLocaleString('en-PH')}/month. This quotation is valid for ${proposal.validityDays ?? 30} days.`,
    '',
    'We would be glad to walk you through it and answer any questions.',
    '',
    'Best regards,',
    proposal.preparedBy || 'NexDev Systems',
    'OnClock HR & Payroll · onclockph.com',
  ].join('\n')

  try {
    const messageId = await sendProposalEmail({
      to,
      subject,
      message,
      pdf: bytes,
      filename: `${(proposal.quoteNo || 'quotation').replace(/[^a-z0-9\-_]+/gi, '-')}.pdf`,
    })
    return NextResponse.json({ ok: true, messageId, to })
  } catch (e) {
    console.error('[proposal/send] email error', e)
    return NextResponse.json({ error: 'Failed to send email. Check SMTP configuration.' }, { status: 502 })
  }
}
