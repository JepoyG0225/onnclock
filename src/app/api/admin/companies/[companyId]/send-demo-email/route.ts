import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { sendDemoOutreachEmail } from '@/lib/mailer'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const { companyId } = await params
  const body = await req.json().catch(() => ({}))
  const demoBookingUrl = body.demoBookingUrl as string | undefined

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, email: true },
  })

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  if (!company.email) return NextResponse.json({ error: 'Company has no email address' }, { status: 400 })

  try {
    await sendDemoOutreachEmail({
      to: company.email,
      companyName: company.name,
      demoBookingUrl,
    })
  } catch (err) {
    console.error('[send-demo-email] SMTP error for company', companyId, company.email, err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send email — check SMTP configuration' },
      { status: 502 }
    )
  }

  const updated = await prisma.company.update({
    where: { id: companyId },
    data: { demoStatus: 'EMAIL_SENT', demoEmailSentAt: new Date() },
    select: { id: true, demoStatus: true, demoEmailSentAt: true },
  })

  return NextResponse.json({ ok: true, company: updated })
}
