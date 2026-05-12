/**
 * POST /api/admin/companies/[companyId]/send-trial-email
 * Body: { template: 'no-employee-setup' | 'trial-expiration' | 'trial-expired' }
 *
 * SUPER_ADMIN-only. Sends one of three trial-related emails to the company's
 * billing/admin email. Uses existing mailer templates where possible:
 *   - no-employee-setup → sendNoEmployeeSetupEmail()        (new)
 *   - trial-expiration  → sendSubscriptionExpiryNotice()    (existing)
 *   - trial-expired     → sendExpiredTrialNotice()          (existing)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  sendNoEmployeeSetupEmail,
  sendSubscriptionExpiryNotice,
  sendExpiredTrialNotice,
} from '@/lib/mailer'

type Template = 'no-employee-setup' | 'trial-expiration' | 'trial-expired'

const TEMPLATE_LABELS: Record<Template, string> = {
  'no-employee-setup': 'No Employee Setup reminder',
  'trial-expiration': 'Trial Expiration reminder',
  'trial-expired': 'Trial Expired notice',
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const { companyId } = await params
  const body = await req.json().catch(() => ({}))
  const template = body.template as Template | undefined
  if (!template || !(template in TEMPLATE_LABELS)) {
    return NextResponse.json(
      { error: 'template must be one of: no-employee-setup, trial-expiration, trial-expired' },
      { status: 400 },
    )
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      email: true,
      senderEmail: true,
      senderName: true,
      subscription: { select: { trialEndsAt: true } },
    },
  })
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  if (!company.email) {
    return NextResponse.json({ error: 'Company has no email address on file' }, { status: 400 })
  }

  const trialEndsAt = company.subscription?.trialEndsAt ?? null

  try {
    if (template === 'no-employee-setup') {
      await sendNoEmployeeSetupEmail({
        to: company.email,
        companyName: company.name,
        trialEndsAt,
        senderEmail: company.senderEmail,
        senderName: company.senderName,
      })
    } else if (template === 'trial-expiration') {
      if (!trialEndsAt) {
        return NextResponse.json(
          { error: 'Company has no trial end date configured' },
          { status: 400 },
        )
      }
      const daysRemaining = Math.max(
        0,
        Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      )
      await sendSubscriptionExpiryNotice({
        to: company.email,
        companyName: company.name,
        expiryDate: trialEndsAt,
        daysRemaining,
        isTrial: true,
        senderEmail: company.senderEmail,
        senderName: company.senderName,
      })
    } else {
      // trial-expired
      await sendExpiredTrialNotice({
        to: company.email,
        companyName: company.name,
        expiredAt: trialEndsAt ?? new Date(),
        senderEmail: company.senderEmail,
        senderName: company.senderName,
      })
    }
  } catch (err) {
    console.error('[send-trial-email] SMTP error', { companyId, template, err })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send email — check SMTP configuration' },
      { status: 502 },
    )
  }

  // Best-effort audit log — non-fatal if the table or row insertion fails.
  try {
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        userId: ctx.userId,
        action: 'TRIAL_EMAIL_SENT',
        entity: 'Company',
        entityId: company.id,
        newValues: { template, sentTo: company.email, label: TEMPLATE_LABELS[template] },
      },
    })
  } catch {
    // Don't fail the request if audit logging hiccups.
  }

  return NextResponse.json({
    ok: true,
    sentTo: company.email,
    template,
    label: TEMPLATE_LABELS[template],
  })
}
