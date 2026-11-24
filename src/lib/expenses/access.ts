import { requireAuth } from '@/lib/api-auth'
import { requireHrisProOrTrialApi } from '@/lib/hris-pro'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
export async function expenseAccess() {
  const auth = await requireAuth()
  if (auth.error) return { ...auth, employeeId: null, canReadAll: false, canApprove: false }
  const error = await requireHrisProOrTrialApi(auth.ctx.companyId)
  if (error) return { ctx: null, error, employeeId: null, canReadAll: false, canApprove: false }
  const [employee, read, approve] = await Promise.all([
    prisma.employee.findFirst({ where: { companyId: auth.ctx.companyId, userId: auth.ctx.userId, isActive: true }, select: { id: true } }),
    ctxHasPermission(auth.ctx, 'expenses:read'), ctxHasPermission(auth.ctx, 'expenses:approve'),
  ])
  return { ...auth, employeeId: employee?.id ?? null, canReadAll: read || approve, canApprove: approve }
}
