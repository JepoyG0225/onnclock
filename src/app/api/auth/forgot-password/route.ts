import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/mailer'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, isActive: true },
    })

    // Always return success to avoid leaking whether an email exists
    if (!user || !user.isActive) {
      return NextResponse.json({ ok: true })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    })

    const appUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'https://onclockph.com'
    const resetUrl = `${appUrl}/reset-password?token=${token}`

    try {
      await sendPasswordResetEmail(user.email, resetUrl)
      console.log('[forgot-password] email sent to', user.email)
    } catch (mailErr) {
      console.error('[forgot-password] SMTP error for', user.email, mailErr)
      // Still return ok — don't leak internal errors to the client
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/auth/forgot-password]', err)
    return NextResponse.json({ ok: true })
  }
}
