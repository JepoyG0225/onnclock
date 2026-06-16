import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSubscriptionExpiryNotice } from '@/lib/mailer'

function isAuthorized(req: NextRequest) {
  const configured = process.env.CRON_SECRET
  if (!configured) return false
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  return token === configured
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // 24-hour window centred on the 3-day mark.
  // Cron fires once per day, so each subscription is matched exactly once.
  const windowStart = new Date(now.getTime() + 2.5 * 24 * 60 * 60 * 1000)
  const windowEnd   = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000)

  // Subscriptions on TRIAL expiring in ~3 days
  const expiringTrials = await prisma.subscription.findMany({
    where: {
      status: 'TRIAL',
      trialEndsAt: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      companyId: true,
      trialEndsAt: true,
      company: {
        select: {
          name: true,
          senderEmail: true,
          senderName: true,
          users: {
            where: { role: 'COMPANY_ADMIN', isActive: true },
            select: { user: { select: { email: true } } },
            take: 3,
          },
        },
      },
    },
  })

  // Paid subscriptions whose current period ends in ~3 days
  const expiringActive = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      companyId: true,
      currentPeriodEnd: true,
      company: {
        select: {
          name: true,
          senderEmail: true,
          senderName: true,
          users: {
            where: { role: 'COMPANY_ADMIN', isActive: true },
            select: { user: { select: { email: true } } },
            take: 3,
          },
        },
      },
    },
  })

  const results: Array<{ companyId: string; emails: string[]; status: string }> = []

  const sendNotices = async (
    companyId: string,
    company: { name: string; senderEmail?: string | null; senderName?: string | null },
    expiryDate: Date,
    isTrial: boolean,
    adminEmails: string[],
  ) => {
    if (adminEmails.length === 0) {
      results.push({ companyId, emails: [], status: 'skipped_no_admin_email' })
      return
    }

    const daysRemaining = Math.max(1, Math.ceil((expiryDate.getTime() - now.getTime()) / 86_400_000))
    const emailErrors: string[] = []

    for (const email of adminEmails) {
      try {
        await sendSubscriptionExpiryNotice({
          to: email,
          companyName: company.name,
          expiryDate,
          daysRemaining,
          isTrial,
          senderEmail: company.senderEmail,
          senderName: company.senderName,
        })
      } catch (err) {
        emailErrors.push(`${email}: ${(err as Error).message}`)
      }
    }

    results.push({
      companyId,
      emails: adminEmails,
      status: emailErrors.length ? `partial_failure: ${emailErrors.join('; ')}` : 'sent',
    })
  }

  for (const sub of expiringTrials) {
    const emails = sub.company.users.map((u) => u.user.email).filter(Boolean) as string[]
    await sendNotices(sub.companyId, sub.company, sub.trialEndsAt!, true, emails)
  }

  for (const sub of expiringActive) {
    const emails = sub.company.users.map((u) => u.user.email).filter(Boolean) as string[]
    await sendNotices(sub.companyId, sub.company, sub.currentPeriodEnd!, false, emails)
  }

  return NextResponse.json({
    ok: true,
    checked: expiringTrials.length + expiringActive.length,
    results,
  })
}
