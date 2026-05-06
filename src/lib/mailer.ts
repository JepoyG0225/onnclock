import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'

const smtpHost = process.env.SMTP_HOST || 'smtp.hostinger.com'
const smtpPort = Number(process.env.SMTP_PORT) || 465
const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS

// Diagnostic log — visible in Vercel/server logs on cold start
console.log('[mailer] SMTP config:', {
  host: smtpHost,
  port: smtpPort,
  user: smtpUser ? `${smtpUser.slice(0, 4)}***` : '(NOT SET)',
  pass: smtpPass ? '(set)' : '(NOT SET)',
})

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: { user: smtpUser, pass: smtpPass },
})

function buildFromIdentity(options?: { senderEmail?: string | null; senderName?: string | null }) {
  const fallbackEmail = process.env.SMTP_FROM || process.env.SMTP_USER
  const senderEmail = options?.senderEmail?.trim() || fallbackEmail
  const senderName = options?.senderName?.trim() || 'Onclock'
  return `"${senderName}" <${senderEmail}>`
}

async function getCompanyMailer(companyId: string) {
  const rows = await prisma.$queryRaw<Array<{
    name: string | null
    senderEmail: string | null
    senderName: string | null
    smtpHost: string | null
    smtpPort: number | null
    smtpSecure: boolean | null
    smtpUser: string | null
    smtpPass: string | null
    smtpFromEmail: string | null
    smtpFromName: string | null
  }>>`
    SELECT
      "name",
      "senderEmail",
      "senderName",
      "smtpHost",
      "smtpPort",
      "smtpSecure",
      "smtpUser",
      "smtpPass",
      "smtpFromEmail",
      "smtpFromName"
    FROM "companies"
    WHERE "id" = ${companyId}
    LIMIT 1
  `
  const company = rows[0]

  if (company?.smtpHost && company?.smtpPort && company?.smtpUser && company?.smtpPass) {
    const customTransporter = nodemailer.createTransport({
      host: company.smtpHost,
      port: company.smtpPort,
      secure: company.smtpSecure ?? (company.smtpPort === 465),
      auth: {
        user: company.smtpUser,
        pass: company.smtpPass,
      },
    })
    return {
      transporter: customTransporter,
      from: buildFromIdentity({
        senderEmail: company.smtpFromEmail ?? company.smtpUser,
        senderName: company.smtpFromName ?? company.name ?? 'Onclock',
      }),
    }
  }

  return {
    transporter,
    from: buildFromIdentity({ senderEmail: company?.senderEmail, senderName: company?.senderName ?? company?.name }),
  }
}

export async function sendSubscriptionExpiryNotice({
  to,
  companyName,
  expiryDate,
  daysRemaining,
  isTrial,
  senderEmail,
  senderName,
}: {
  to: string
  companyName: string
  expiryDate: Date
  daysRemaining: number
  isTrial: boolean
  senderEmail?: string | null
  senderName?: string | null
}) {
  const from = buildFromIdentity({ senderEmail, senderName })
  const billingUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://onclockph.com'}/settings/billing`
  const formattedDate = expiryDate.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const urgencyColor = daysRemaining <= 1 ? '#dc2626' : daysRemaining <= 3 ? '#ea580c' : '#d97706'
  const planLabel = isTrial ? 'free trial' : 'subscription'
  const subject = daysRemaining <= 1
    ? `⚠️ Your Onclock ${planLabel} expires today`
    : `Your Onclock ${planLabel} expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`

  await transporter.sendMail({
    from,
    to,
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff">
        <div style="text-align:center;margin-bottom:32px">
          <img src="https://onclockph.com/onclock-logo.png" alt="Onclock" style="height:36px" />
        </div>

        <div style="background:${urgencyColor}15;border:1px solid ${urgencyColor}40;border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center">
          <p style="margin:0;font-size:28px;font-weight:900;color:${urgencyColor}">
            ${daysRemaining <= 0 ? 'Expired' : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`}
          </p>
          <p style="margin:4px 0 0;font-size:13px;color:#64748b">
            ${isTrial ? 'Free trial' : 'Subscription'} ends on <strong>${formattedDate}</strong>
          </p>
        </div>

        <h2 style="font-size:18px;font-weight:800;color:#0f172a;margin:0 0 8px">
          Hi ${companyName},
        </h2>
        <p style="font-size:14px;color:#64748b;margin:0 0 16px;line-height:1.6">
          Your Onclock ${planLabel} is expiring soon. To keep your payroll, attendance, and HR tools running without interruption, please renew before <strong>${formattedDate}</strong>.
        </p>
        <p style="font-size:14px;color:#64748b;margin:0 0 24px;line-height:1.6">
          After expiry, access to the dashboard will be restricted until a valid subscription is active.
        </p>

        <a href="${billingUrl}"
           style="display:inline-block;padding:14px 32px;background:#fa5e01;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700">
          Renew Now →
        </a>

        <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;line-height:1.6">
          If you have already renewed, please disregard this email. For billing questions, reply to this email or contact our support team.
        </p>
        <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0" />
        <p style="font-size:11px;color:#cbd5e1;text-align:center;margin:0">
          Onclock &mdash; Payroll &amp; Time Keeping Made Easy
        </p>
      </div>
    `,
    text: `Your Onclock ${planLabel} expires in ${daysRemaining} day(s) on ${formattedDate}.\n\nRenew now: ${billingUrl}\n\nIf you have already renewed, please ignore this email.`,
  })
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const from = buildFromIdentity()
  console.log('[mailer] sendPasswordResetEmail → to:', to)

  const info = await transporter.sendMail({
    from,
    to,
    subject: 'Reset your Onclock password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff">
        <div style="text-align:center;margin-bottom:32px">
          <img src="https://onclockph.com/onclock-logo.png" alt="Onclock" style="height:36px" />
        </div>
        <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px">Reset your password</h2>
        <p style="font-size:14px;color:#64748b;margin:0 0 24px;line-height:1.6">
          We received a request to reset the password for your Onclock account.
          Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#2E4156,#1A2D42);color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700">
          Reset Password
        </a>
        <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;line-height:1.6">
          If you didn&apos;t request this, you can safely ignore this email — your password won&apos;t change.
        </p>
        <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0" />
        <p style="font-size:11px;color:#cbd5e1;text-align:center;margin:0">
          Onclock &mdash; Payroll &amp; Time Keeping Made Easy
        </p>
      </div>
    `,
    text: `Reset your Onclock password\n\nClick the link below to reset your password (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
  })
  console.log('[mailer] sendPasswordResetEmail ✓ messageId:', info.messageId)
}

export async function sendExpiredTrialNotice({
  to,
  companyName,
  expiredAt,
  senderEmail,
  senderName,
}: {
  to: string
  companyName: string
  expiredAt: Date
  senderEmail?: string | null
  senderName?: string | null
}) {
  const from = buildFromIdentity({ senderEmail, senderName })
  const billingUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://onclockph.com'}/settings/billing`
  const formattedDate = expiredAt.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  await transporter.sendMail({
    from,
    to,
    subject: 'Your Onclock free trial has expired',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff">
        <div style="text-align:center;margin-bottom:32px">
          <img src="https://onclockph.com/onclock-logo.png" alt="Onclock" style="height:36px" />
        </div>
        <div style="background:#dc262615;border:1px solid #dc262640;border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center">
          <p style="margin:0;font-size:28px;font-weight:900;color:#dc2626">Trial Expired</p>
          <p style="margin:4px 0 0;font-size:13px;color:#64748b">
            Your free trial ended on <strong>${formattedDate}</strong>
          </p>
        </div>
        <h2 style="font-size:18px;font-weight:800;color:#0f172a;margin:0 0 8px">
          Hi ${companyName},
        </h2>
        <p style="font-size:14px;color:#64748b;margin:0 0 16px;line-height:1.6">
          Your Onclock free trial has expired. To continue using payroll, attendance, and HR features, please activate your subscription.
        </p>
        <p style="font-size:14px;color:#64748b;margin:0 0 24px;line-height:1.6">
          Once your subscription is active, full dashboard access will resume.
        </p>
        <a href="${billingUrl}"
           style="display:inline-block;padding:14px 32px;background:#fa5e01;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700">
          Activate Subscription →
        </a>
        <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;line-height:1.6">
          If you have already renewed, please disregard this email.
        </p>
      </div>
    `,
    text: `Your Onclock free trial expired on ${formattedDate}. Activate your subscription here: ${billingUrl}`,
  })
}

export async function sendDemoOutreachEmail({
  to,
  companyName,
  demoBookingUrl,
}: {
  to: string
  companyName: string
  demoBookingUrl?: string
}) {
  const from = buildFromIdentity({ senderName: 'Onclock Team' })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://onclockph.com'
  const bookingLink = demoBookingUrl ?? 'https://onclockph.com/demo'
  const loginUrl = `${appUrl}/login`

  console.log('[mailer] sendDemoOutreachEmail → to:', to, '| cc: sales@nexdevsystems.io')
  const info = await transporter.sendMail({
    from,
    to,
    cc: 'sales@nexdevsystems.io',
    subject: `👋 Need help getting started with Onclock, ${companyName}?`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;background:#ffffff">
        <div style="text-align:center;margin-bottom:28px">
          <img src="https://onclockph.com/onclock-logo.png" alt="Onclock" style="height:36px" />
        </div>

        <h2 style="font-size:20px;font-weight:900;color:#0f172a;margin:0 0 12px">
          Hi ${companyName} 👋
        </h2>
        <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">
          We noticed your Onclock account is all set up but hasn't had employees added yet.
          We'd love to help you get the most out of the platform!
        </p>
        <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 24px">
          Whether you need a quick walkthrough of how to set up your team, configure payroll,
          or track attendance — we're here to help you get started.
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <p style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 8px">✅ What a free demo includes:</p>
          <ul style="margin:0;padding-left:20px;font-size:13px;color:#475569;line-height:1.8">
            <li>Guided setup of your employees, departments &amp; positions</li>
            <li>Payroll &amp; DTR configuration walkthrough</li>
            <li>Leave management &amp; schedule setup</li>
            <li>Q&amp;A with our support team</li>
          </ul>
        </div>

        <div style="text-align:center;margin-bottom:28px">
          <a href="${bookingLink}"
             style="display:inline-block;background:#2E4156;color:#ffffff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none">
            Book a Free Demo →
          </a>
        </div>

        <p style="font-size:13px;color:#94a3b8;text-align:center;margin:0 0 8px">
          Or log in anytime and explore at your own pace.
        </p>
        <div style="text-align:center;margin-bottom:24px">
          <a href="${loginUrl}" style="font-size:13px;color:#2E4156;text-decoration:underline">
            Go to my Onclock account
          </a>
        </div>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="font-size:11px;color:#cbd5e1;text-align:center;margin:0">
          Onclock · HR &amp; Payroll for Philippine Businesses ·
          <a href="${appUrl}" style="color:#cbd5e1">onclockph.com</a>
        </p>
      </div>
    `,
  })
  console.log('[mailer] sendDemoOutreachEmail ✓ messageId:', info.messageId)
}

export async function sendRecruitmentStageEmail({
  companyId,
  to,
  subject,
  body,
}: {
  companyId: string
  to: string
  subject: string
  body: string
}) {
  const resolved = await getCompanyMailer(companyId)
  await resolved.transporter.sendMail({
    from: resolved.from,
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, '<br/>'),
  })
}
