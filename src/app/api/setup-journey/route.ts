import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { getHrisProAccess } from '@/lib/hris-pro'
import { canAccessPath } from '@/lib/auth/page-access'
import { SETUP_STEPS } from '@/lib/onboarding/setup-journey'
import { z } from 'zod'

async function context() {
  const { ctx, error } = await requireAuth()
  if (error) return { error }
  const permissions = await getEffectivePermissions(ctx.role, ctx.companyId, ctx.userId)
  if (ctx.role === 'EMPLOYEE' || !permissions.includes('settings:read')) return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
  const pro = await getHrisProAccess(ctx.companyId)
  const steps = SETUP_STEPS.filter(s => permissions.includes(s.permission) && canAccessPath(s.href, permissions) && (!s.pro || pro.entitled))
  return { ctx, permissions, steps }
}
export async function GET() {
  try {
    const c = await context(); if (c.error) return c.error
    const { ctx, permissions, steps } = c
    const company = await prisma.company.findUnique({ where: { id: ctx.companyId }, select: { address: true, email: true, setupJourney: true } })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    const saved = (company.setupJourney && typeof company.setupJourney === 'object' && !Array.isArray(company.setupJourney) ? company.setupJourney : {}) as Record<string, unknown>
    const where = { companyId: ctx.companyId }
    const checks: Record<string, () => Promise<unknown>> = {
      profile: async () => !!company.address?.trim() && !!company.email?.trim(),
      department: () => prisma.department.findFirst({ where: { ...where, isActive: true }, select: { id: true } }),
      position: () => prisma.position.findFirst({ where: { ...where, isActive: true }, select: { id: true } }),
      employee: () => prisma.employee.findFirst({ where: { ...where, isActive: true }, select: { id: true } }),
      portal: () => prisma.employee.findFirst({ where: { ...where, isActive: true, userId: { not: null } }, select: { id: true } }),
      schedule: () => prisma.workSchedule.findFirst({ where: { ...where, isActive: true }, select: { id: true } }),
      assignment: () => prisma.employee.findFirst({ where: { ...where, isActive: true, workScheduleId: { not: null } }, select: { id: true } }),
      leaveBalance: () => prisma.leaveBalance.findFirst({ where: { employee: { ...where, isActive: true }, year: new Date().getFullYear(), entitled: { gt: 0 } }, select: { id: true } }),
      payroll: () => prisma.payrollRun.findFirst({ where, select: { id: true } }),
      task: () => prisma.task.findFirst({ where, select: { id: true } }),
      announcement: () => prisma.announcement.findFirst({ where, select: { id: true } }),
    }
    const items = await Promise.all(steps.map(async step => ({ ...step, done: step.automatic ? !!await checks[step.automatic]() : saved[step.id] === true })))
    return NextResponse.json({ steps: items, canEdit: permissions.includes('settings:write') }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[setup-journey] read failed', error)
    return NextResponse.json({ error: 'Unable to load setup progress. Please retry.' }, { status: 503 })
  }
}
export async function PATCH(req: NextRequest) {
  try {
    const c = await context(); if (c.error) return c.error
    if (!c.permissions.includes('settings:write')) return NextResponse.json({ error: 'View-only access' }, { status: 403 })
    const body = z.object({ id: z.string().max(64), done: z.boolean() }).strict().safeParse(await req.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'Invalid setup step' }, { status: 422 })
    const step = c.steps.find(s => s.id === body.data.id)
    if (!step || step.automatic) return NextResponse.json({ error: 'This step is unavailable or completed automatically from saved records.' }, { status: 422 })
    // Atomic JSON merge preserves another admin's concurrently completed steps.
    await prisma.$executeRaw`UPDATE companies SET "setupJourney" = COALESCE("setupJourney", '{}'::jsonb) || ${JSON.stringify({ [step.id]: body.data.done })}::jsonb WHERE id = ${c.ctx.companyId}`
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[setup-journey] update failed', error)
    return NextResponse.json({ error: 'Unable to save progress. Please retry.' }, { status: 503 })
  }
}
