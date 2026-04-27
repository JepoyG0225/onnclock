import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: (Number(process.env.SMTP_PORT) || 465) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendSubscriptionExpiryNotice({
  to,
  companyName,
  expiryDate,
  daysRemaining,
  isTrial,
}: {
  to: string
  companyName: string
  expiryDate: Date
  daysRemaining: number
  isTrial: boolean
}) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
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
    from: `"Onclock" <${from}>`,
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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER

  await transporter.sendMail({
    from: `"Onclock" <${from}>`,
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
}

export async function sendExpiredTrialNotice({
  to,
  companyName,
  expiredAt,
}: {
  to: string
  companyName: string
  expiredAt: Date
}) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  const billingUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://onclockph.com'}/settings/billing`
  const formattedDate = expiredAt.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  await transporter.sendMail({
    from: `"Onclock" <${from}>`,
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
