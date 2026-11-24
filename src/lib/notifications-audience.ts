import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { requestAudience } from '@/lib/approvals/audience'
import type { AuthContext } from '@/lib/api-auth'
import type { ApprovalRequestType } from '@/lib/approvals/engine'

const modules: Record<string, ApprovalRequestType> = {
  '/leaves': 'LEAVE', '/dtr': 'ATTENDANCE_REVIEW', '/timesheets': 'ATTENDANCE_REVIEW',
  '/overtime-requests': 'OVERTIME', '/time-corrections': 'TIME_CORRECTION',
  '/cash-advance': 'CASH_ADVANCE', '/budget-requisitions': 'BUDGET', '/payroll': 'PAYROLL',
}
type Notice = { type: string; link?: string | null }
export function requestNotificationType(notice: Notice): ApprovalRequestType | null {
  const path = notice.link?.split('?')[0].split('#')[0] ?? ''
  const base = '/' + path.split('/')[1]
  return modules[base] ?? (notice.type === 'LEAVE_REQUEST_SUBMITTED' ? 'LEAVE' : null)
}
async function linkedRequest(companyId: string, type: ApprovalRequestType, link?: string | null) {
  const url = new URL(link ?? '/', 'https://onclock.invalid')
  const id = url.searchParams.get('requestId') ?? url.pathname.split('/')[2]
  if (!id) return null
  const employee = { select: { id: true, departmentId: true } }
  switch (type) {
    case 'LEAVE': return prisma.leaveRequest.findFirst({ where: { id, employee: { companyId } }, include: { employee, leaveType: true } })
    case 'CASH_ADVANCE': return prisma.cashAdvanceRequest.findFirst({ where: { id, companyId }, include: { employee } })
    case 'BUDGET': return prisma.budgetRequisition.findFirst({ where: { id, companyId }, include: { employee } })
    case 'OVERTIME': return prisma.overtimeRequest.findFirst({ where: { id, companyId }, include: { employee } })
    case 'TIME_CORRECTION': return prisma.timeEntryCorrection.findFirst({ where: { id, companyId }, include: { employee } })
    case 'ATTENDANCE_REVIEW': return prisma.dTRRecord.findFirst({ where: { id, employee: { companyId } }, include: { employee } })
    case 'PAYROLL': return prisma.payrollRun.findFirst({ where: { id, companyId } })
    default: return null
  }
}
/** Recheck saved notifications against today's assignment; old unscoped broadcasts fail closed. */
export async function notificationVisibility(ctx: AuthContext) {
  let audience: ReturnType<typeof requestAudience> | undefined
  const requests = new Map<string, ReturnType<typeof linkedRequest>>()
  return async (notice: Notice) => {
    if (notice.link?.startsWith('/attendance?restDayRequest=')) return ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN'].includes(ctx.role)
    const type = requestNotificationType(notice)
    if (notice.link?.split('?')[0] === '/expenses') {
      return ctx.role === 'COMPANY_ADMIN' || ctx.role === 'SUPER_ADMIN' || (await getEffectivePermissions(ctx.role, ctx.companyId, ctx.userId)).includes('expenses:approve')
    }
    if (!type) return true
    if (ctx.role === 'COMPANY_ADMIN' || ctx.role === 'SUPER_ADMIN') return true
    const key = type + ':' + notice.link
    if (!requests.has(key)) requests.set(key, linkedRequest(ctx.companyId, type, notice.link))
    const request = await requests.get(key)!
    if (!request) return false
    audience ??= requestAudience(ctx)
    return (await audience)(type, request)
  }
}
export async function requestNotificationRecipients(companyId: string, notice: Notice, candidates?: string[]) {
  const members = await prisma.userCompany.findMany({ where: { companyId, isActive: true, user: { isActive: true }, ...(candidates ? { userId: { in: candidates } } : {}) }, select: { userId: true, role: true } })
  const checks = await Promise.all(members.map(async member => {
    const visible = await notificationVisibility({ companyId, userId: member.userId, role: member.role, email: '' })
    return await visible(notice) ? member.userId : null
  }))
  return [...new Set(checks.filter((id): id is string => id !== null))]
}
