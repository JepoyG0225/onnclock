import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const secret = req.headers.get('x-admin-secret')
  if (!secret || secret !== (process.env.ADMIN_SEED_SECRET ?? 'onclock-seed-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = 'admin@onclock.om'
  const password = 'Onclock2026!!'
  const now = new Date()

  let systemCompany = await prisma.company.findFirst({
    where: { name: 'Onclock System' },
    select: { id: true },
  })

  if (!systemCompany) {
    systemCompany = await prisma.company.create({
      data: {
        name: 'Onclock System',
        email,
        isActive: true,
      },
      select: { id: true },
    })
  }

  const passwordHash = await hash(password, 12)
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      isActive: true,
      name: 'System Admin',
      updatedAt: now,
    },
    create: {
      email,
      passwordHash,
      name: 'System Admin',
      isActive: true,
      updatedAt: now,
    },
    select: { id: true, email: true },
  })

  await prisma.userCompany.upsert({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId: systemCompany.id,
      },
    },
    update: {
      role: 'SUPER_ADMIN',
      isActive: true,
      updatedAt: now,
    },
    create: {
      userId: user.id,
      companyId: systemCompany.id,
      role: 'SUPER_ADMIN',
      isActive: true,
      updatedAt: now,
    },
  })

  return NextResponse.json({
    message: 'Super admin seeded successfully.',
    user: { email: user.email },
    companyId: systemCompany.id,
  })
}

