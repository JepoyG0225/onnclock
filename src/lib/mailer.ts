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

