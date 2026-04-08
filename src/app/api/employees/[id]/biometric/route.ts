import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// GET /api/employees/[id]/biometric — returns biometric enrollment status for admin view
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { biometricCredential: true },
  })
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ enrolled: !!employee.biometricCredential })
}

// DELETE /api/employees/[id]/biometric — resets biometric credential (admin only)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireAdminOrHR(ctx)
  if (denied) return denied

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      biometricCredential: Prisma.JsonNull,
      biometricChallenge: null,
      biometricChallengeAt: null,
    },
  })

  return NextResponse.json({ success: true })
}
