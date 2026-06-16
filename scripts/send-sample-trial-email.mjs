/**
 * One-shot: send a sample "Trial Expiration Reminder" email so the team can
 * preview the template. Reads SMTP_* from process.env (loaded from /tmp/.env.smtp.check).
 *
 * Usage:
 *   set -a; source /tmp/.env.smtp.check; set +a; node scripts/send-sample-trial-email.mjs
 */
import nodemailer from 'nodemailer'

const TO = process.argv[2] || 'jefcgealonn@gmail.com'

const host = process.env.SMTP_HOST || 'smtp.hostinger.com'
const port = parseInt(process.env.SMTP_PORT || '465', 10)
const user = process.env.SMTP_USER
const pass = process.env.SMTP_PASS
const fromAddr = process.env.SMTP_FROM || user
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://onclockph.com'

if (!user || !pass) {
  console.error('Missing SMTP_USER or SMTP_PASS in environment')
  process.exit(1)
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
})

// Sample: trial expires in 5 days on May 16, 2026
const expiryDate = new Date('2026-05-16T00:00:00+08:00')
const daysRemaining = 5
const companyName = 'Sample Company'
const billingUrl = `${appUrl}/settings/billing`
const formattedDate = expiryDate.toLocaleDateString('en-PH', {
  year: 'numeric', month: 'long', day: 'numeric',
})
const urgencyColor = daysRemaining <= 1 ? '#dc2626' : daysRemaining <= 3 ? '#ea580c' : '#d97706'

console.log(`Sending sample trial reminder to ${TO} via ${host}:${port} as ${fromAddr}...`)
const info = await transporter.sendMail({
  from: `OnClock <${fromAddr}>`,
  to: TO,
  subject: `Your Onclock free trial expires in ${daysRemaining} days  [SAMPLE]`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff">
      <div style="text-align:center;margin-bottom:32px">
        <img src="https://onclockph.com/onclock-logo.png" alt="Onclock" style="height:36px" />
      </div>
      <div style="background:${urgencyColor}15;border:1px solid ${urgencyColor}40;border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center">
        <p style="margin:0;font-size:28px;font-weight:900;color:${urgencyColor}">
          ${daysRemaining} days left
        </p>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b">
          Free trial ends on <strong>${formattedDate}</strong>
        </p>
      </div>
      <h2 style="font-size:18px;font-weight:800;color:#0f172a;margin:0 0 8px">Hi ${companyName},</h2>
      <p style="font-size:14px;color:#64748b;margin:0 0 16px;line-height:1.6">
        Your Onclock free trial is expiring soon. To keep your payroll, attendance, and HR tools running without interruption, please renew before <strong>${formattedDate}</strong>.
      </p>
      <p style="font-size:14px;color:#64748b;margin:0 0 24px;line-height:1.6">
        After expiry, access to the dashboard will be restricted until a valid subscription is active.
      </p>
      <a href="${billingUrl}" style="display:inline-block;padding:14px 32px;background:#fa5e01;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700">
        Renew Now &rarr;
      </a>
      <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;line-height:1.6">
        If you have already renewed, please disregard this email. For billing questions, reply to this email or contact our support team.
      </p>
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0" />
      <p style="font-size:11px;color:#cbd5e1;text-align:center;margin:0">
        Onclock &mdash; Payroll &amp; Time Keeping Made Easy
      </p>
      <p style="font-size:10px;color:#fbbf24;text-align:center;margin:8px 0 0;font-weight:bold">
        [SAMPLE PREVIEW — not a real expiration notice]
      </p>
    </div>
  `,
  text: `Your Onclock free trial expires in ${daysRemaining} days on ${formattedDate}.\n\nRenew now: ${billingUrl}\n\n[SAMPLE PREVIEW — not a real expiration notice]`,
})
console.log('✓ Sent. messageId:', info.messageId)
console.log('  response:', info.response)
