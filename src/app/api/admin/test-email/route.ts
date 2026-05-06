/**
 * POST /api/admin/test-email
 * Body: { to: "someone@example.com" }
 *
 * Sends a test email to verify SMTP is configured correctly.
 * Super admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const to: string = body.to || (process.env.SMTP_USER ?? '')

  const smtpHost = process.env.SMTP_HOST || 'smtp.hostinger.com'
  const smtpPort = Number(process.env.SMTP_PORT) || 465
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM || smtpUser

  // Return config info (no password)
  const config = {
    host: smtpHost,
    port: smtpPort,
    user: smtpUser ? `${smtpUser.slice(0, 4)}***` : '(NOT SET)',
    pass: smtpPass ? '(set)' : '(NOT SET)',
    from: smtpFrom,
    to,
  }

  if (!smtpUser || !smtpPass) {
    return NextResponse.json({
      ok: false,
      error: 'SMTP_USER or SMTP_PASS not configured in environment variables',
      config,
    }, { status: 500 })
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    })

    // Verify connection first
    await transporter.verify()

    const info = await transporter.sendMail({
      from: `"Onclock Test" <${smtpFrom}>`,
      to,
      subject: '✅ Onclock SMTP Test',
      text: 'This is a test email to confirm SMTP is working correctly.',
      html: `<p style="font-family:sans-serif">✅ <strong>SMTP is working!</strong> This test was sent from the Onclock admin panel.</p><p style="color:#64748b;font-size:12px">Host: ${smtpHost}:${smtpPort} | From: ${smtpFrom}</p>`,
    })

    console.log('[test-email] ✓ sent to', to, '| messageId:', info.messageId)
    return NextResponse.json({ ok: true, messageId: info.messageId, config })
  } catch (err) {
    console.error('[test-email] SMTP error:', err)
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'SMTP send failed',
      config,
    }, { status: 502 })
  }
}
