import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/** POST /api/admin/disbursement-topups/[id]/approve — approve a PAID top-up and credit the wallet */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth(['SUPER_ADMIN'])
  if (error) return error

  const { id } = await params

  const topUp = await prisma.disbursementTopUp.findUnique({ where: { id } })
  if (!topUp) return NextResponse.json({ error: 'Top-up not found' }, { status: 404 })
  if (topUp.status !== 'PAID') {
    return NextResponse.json({ error: `Cannot approve a top-up with status "${topUp.status}"` }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.disbursementTopUp.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    }),
    prisma.company.update({
      where: { id: topUp.companyId },
      data: { disbursementBalance: { increment: topUp.amountPeso } },
    }),
  ])

  return NextResponse.json({ success: true, amountPeso: topUp.amountPeso.toNumber() })
}
