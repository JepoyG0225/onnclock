import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const record = await prisma.dTRRecord.findFirst({
    where: { id, employee: { companyId: ctx.companyId } },
  })
  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  await prisma.dTRRecord.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
