import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { DEFAULT_LEAVE_TYPES, PH_HOLIDAYS_2025, PH_HOLIDAYS_2026 } from '@/lib/constants'

export async function POST(req: NextRequest) {
  try {
    if (process.env.DATABASE_URL) {
      try {
        const dbHost = new URL(process.env.DATABASE_URL).host
        console.log('[companies] DATABASE_URL host:', dbHost)
      } catch {
        console.log('[companies] DATABASE_URL present but not a valid URL')
      }
    } else {
      console.log('[companies] DATABASE_URL is missing')
    }

    const { name, adminEmail, adminPassword, firstName, lastName } = await req.json()

    if (!name || !adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: 'Company name, email, and password are required' },
        { status: 400 },
      )
    }

    const existing = await prisma.user.findUnique({ where: { email: adminEmail } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const passwordHash = await hash(adminPassword, 12)
    const configuredBaseDomain = (process.env.PORTAL_BASE_DOMAIN || '').trim()
    const requestHost = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').trim()
    const protocol =
      process.env.NODE_ENV === 'production'
        ? 'https'
        : ((req.headers.get('x-forwarded-proto') || 'http').split(',')[0] || 'http')
    const baseDomain = configuredBaseDomain || requestHost || 'localhost:3000'

    const company = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          name: `${firstName} ${lastName}`.trim(),
        },
      })

      const company = await tx.company.create({
        data: {
          name,
          email: adminEmail,
          portalSubdomain: null,
          portalUrl: `${protocol}://${baseDomain}/portal`,
        },
      })

      await tx.userCompany.create({
        data: { userId: user.id, companyId: company.id, role: 'COMPANY_ADMIN' },
      })

      await tx.contributionConfig.create({
        data: { companyId: company.id, updatedAt: new Date() },
      })

      await tx.deMinimisConfig.create({
        data: { companyId: company.id, updatedAt: new Date() },
      })

      await tx.leaveType.createMany({
        data: DEFAULT_LEAVE_TYPES.map((lt) => ({ ...lt, companyId: company.id })),
      })

      const allHolidays = [...PH_HOLIDAYS_2025, ...PH_HOLIDAYS_2026]
      await tx.holiday.createMany({
        data: allHolidays.map((h) => ({
          companyId: company.id,
          name: h.name,
          date: new Date(h.date),
          type: h.type,
          isRecurring: true,
        })),
      })

      await tx.workSchedule.create({
        data: {
          companyId: company.id,
          name: 'Standard (8am-5pm)',
          scheduleType: 'FIXED',
          workDays: [1, 2, 3, 4, 5],
          timeIn: '08:00',
          timeOut: '17:00',
          breakMinutes: 60,
          workHoursPerDay: 8,
          workDaysPerWeek: 5,
        },
      })

      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + 14)
      await tx.subscription.create({
        data: {
          id: `sub_${company.id}`,
          companyId: company.id,
          plan: 'TRIAL',
          status: 'TRIAL',
          trialEndsAt,
          pricePerSeat: 50,
          seatCount: 0,
          updatedAt: new Date(),
        },
      })

      return company
    })

    // Verify the UserCompany link was actually committed (guards against PgBouncer partial commits)
    const link = await prisma.userCompany.findFirst({
      where: { companyId: company.id },
      select: { id: true },
    })
    if (!link) {
      // Partial commit detected — clean up orphaned records
      await prisma.company.delete({ where: { id: company.id } }).catch(() => null)
      await prisma.user.deleteMany({ where: { email: adminEmail } }).catch(() => null)
      return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ company }, { status: 201 })
  } catch (error) {
    console.error('Company creation error:', error)
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
  }
}
