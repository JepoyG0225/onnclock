/**
 * POST /api/desktop-app/auth
 * Authenticates the OnClock Desktop App using email + password.
 * Returns a long-lived Bearer token (30 days) for subsequent API calls.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { compare } from 'bcryptjs'
import { createDesktopToken } from '@/lib/desktop-token'
import { getCompanySubscription, hasScreenCaptureFeature } from '@/lib/feature-gates'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      isActive: true,
      companies: {
        where: { isActive: true },
        select: {
          companyId: true,
          role: true,
          company: { select: { name: true, screenCaptureEnabled: true, screenCaptureFrequencyMinutes: true } },
        },
      },
    },
  })

  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }
  if (!user.isActive) {
    return NextResponse.json({ error: 'Your account has been deactivated.' }, { status: 403 })
  }

  const valid = await compare(password, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  const ROLE_PRIORITY: Record<string, number> = {
    SUPER_ADMIN: 0,
    COMPANY_ADMIN: 1,
    HR_MANAGER: 2,
    PAYROLL_OFFICER: 3,
    DEPARTMENT_HEAD: 4,
    EMPLOYEE: 5,
  }
  const membership = [...user.companies].sort(
    (a, b) => (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99)
  )[0]
  if (!membership) {
    return NextResponse.json({ error: 'No active company associated with this account.' }, { status: 403 })
  }

  const { companyId, role, company } = membership
  const sub = await getCompanySubscription(companyId)
  const screenCaptureEntitled = hasScreenCaptureFeature(sub.pricePerSeat, sub.isTrial)

  const token = createDesktopToken({
    userId: user.id,
    companyId,
    role,
    email: user.email,
  })

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role,
      companyId,
      companyName: company.name,
    },
    screenCapture: {
      entitled: screenCaptureEntitled,
      enabled: screenCaptureEntitled && company.screenCaptureEnabled,
      frequencyMinutes: company.screenCaptureFrequencyMinutes,
    },
  })
}
