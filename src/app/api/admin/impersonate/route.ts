import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { signImpersonateToken, IMPERSONATE_COOKIE } from '@/lib/impersonate'
import { Prisma } from '@prisma/client'

// POST /api/admin/impersonate — start impersonating a company
export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const { companyId } = await req.json()
  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  // Find the company and a suitable admin user
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  })
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // Pick highest-privilege available role so preview shows full admin data.
  const rolePriority = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'EMPLOYEE'] as const
  let target: Prisma.UserCompanyGetPayload<{
    include: { user: { select: { id: true; email: true } } }
  }> | null = null
  for (const role of rolePriority) {
    target = await prisma.userCompany.findFirst({
      where: { companyId, role },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true } } },
    })
    if (target) break
  }
  if (!target) {
    return NextResponse.json({ error: 'No users found for this company' }, { status: 404 })
  }

  const token = await signImpersonateToken({
    companyId: company.id,
    userId: target.user.id,
    role: target.role,
    email: target.user.email,
    companyName: company.name,
    impersonatedBy: ctx.userId,
  })

  const res = NextResponse.json({ ok: true, companyName: company.name })
  res.cookies.set(IMPERSONATE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // 8 hours
  })
  return res
}

// DELETE /api/admin/impersonate — stop impersonation
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(IMPERSONATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  })
  return res
}
