import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { sendExpiredTrialNotice } from '@/lib/mailer'

type RowResult = {
  companyId: string
  companyName: string
  emails: string[]
  status: 'sent' | 'skipped_no_admin_email' | 'failed'
  error?: string
}

export async function POST() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const now = new Date()
  const subscriptions = await prisma.subscription.findMany({
    where: {
      plan: 'TRIAL',
      trialEndsAt: { lt: now },
      OR: [{ status: 'TRIAL' }, { status: 'EXPIRED' }],
    },
    select: {
      companyId: true,
      trialEndsAt: true,
      company: {
        select: {
          name: true,
          users: {
            where: { role: 'COMPANY_ADMIN', isActive: true },
            select: { user: { select: { email: true } } },
            take: 5,
          },
        },
      },
    },
  })

  const results: RowResult[] = []

  for (const sub of subscriptions) {
    const emails = Array.from(
      new Set(
        sub.company.users
          .map((item) => item.user.email)
          .filter((email): email is string => Boolean(email))
      )
    )

    if (emails.length === 0) {
      results.push({
        companyId: sub.companyId,
        companyName: sub.company.name,
        emails: [],
        status: 'skipped_no_admin_email',
      })
      continue
    }

    try {
      for (const email of emails) {
        await sendExpiredTrialNotice({
          to: email,
          companyName: sub.company.name,
          expiredAt: sub.trialEndsAt ?? now,
        })
      }

      results.push({
        companyId: sub.companyId,
        companyName: sub.company.name,
        emails,
        status: 'sent',
      })
    } catch (e) {
      results.push({
        companyId: sub.companyId,
        companyName: sub.company.name,
        emails,
        status: 'failed',
        error: e instanceof Error ? e.message : 'Failed to send email',
      })
    }
  }

  const summary = {
    totalExpiredTrials: subscriptions.length,
    sent: results.filter((r) => r.status === 'sent').length,
    skipped: results.filter((r) => r.status === 'skipped_no_admin_email').length,
    failed: results.filter((r) => r.status === 'failed').length,
  }

  return NextResponse.json({ ok: true, summary, results })
}

