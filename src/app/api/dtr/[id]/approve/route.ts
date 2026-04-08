import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const action = body.action as 'APPROVED' | 'REJECTED'

  const record = await prisma.dTRRecord.findFirst({
    where: { id },
  })
  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  const updated = await prisma.dTRRecord.update({
    where: { id },
    data: action === 'APPROVED'
      ? { approvedBy: ctx.userId }
      : { approvedBy: null, remarks: record.remarks ?? 'REJECTED' },
  })

  return NextResponse.json(updated)
}
