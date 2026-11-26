import { KpiCard } from '@/components/ui/kpi-card'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays, Plus, Clock3, CheckCircle2, XCircle, Search, ArrowUpRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { LeaveRowOpener } from '@/components/leaves/LeaveRowOpener'
import { ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { authorizeAdvance, buildPlan, resolveWorkflow } from '@/lib/approvals/engine'

export default async function LeavesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')
  const permissions = await getEffectivePermissions(session.user.role, companyId, session.user.id)
  const isHR = permissions.includes('leaves:approve')
  const status = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(params.status ?? '') ? params.status : undefined
  const query = (params.q ?? '').trim().slice(0, 200)
  const summaries = await prisma.leaveRequest.groupBy({ by: ['status'], where: { employee: { companyId } }, _count: { _all: true } })
  const count = (value: string) => summaries.find(item => item.status === value)?._count._all ?? 0
  const total = summaries.reduce((sum, item) => sum + item._count._all, 0)
  const filterUrl = (value: string) => {
    const search = new URLSearchParams()
    if (value) search.set('status', value)
    if (query) search.set('q', query)
    return `/leaves${search.size ? '?' + search.toString() : ''}`
  }

  const requests = await prisma.leaveRequest.findMany({
    where: {
      status: status ? (status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED') : undefined,
      employee: { companyId },
      ...(query ? { OR: [
        { employee: { firstName: { contains: query, mode: 'insensitive' as const } } },
        { employee: { lastName: { contains: query, mode: 'insensitive' as const } } },
        { employee: { employeeNo: { contains: query, mode: 'insensitive' as const } } },
        { leaveType: { name: { contains: query, mode: 'insensitive' as const } } },
      ] } : {}),
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      totalDays: true,
      status: true,
      createdAt: true,
      approvalLevel: true,
      // Detail-dialog fields — surfaced inside LeaveRequestDetailDialog
      reason: true,
      reviewNotes: true,
      isHalfDay: true,
      halfDayPeriod: true,
      halfDayWindow: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          departmentId: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
      leaveType: { select: { name: true, code: true, isWithPay: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const approvers = await prisma.approverConfig.findMany({
    where: { companyId, type: 'LEAVE' },
    orderBy: { level: 'asc' },
  })
  const approverByLevel = new Map(approvers.map(a => [a.level, a.userId]))
  const userApproverLevel = session?.user?.id
    ? (approvers.find(a => a.userId === session.user.id)?.level ?? null)
    : null
  function legacyApprovalGate(currentLevel: number | null) {
    const level = (currentLevel ?? 0) + 1
    const expectedUserId = approverByLevel.get(level)
    const canApprove = !!expectedUserId && expectedUserId === session?.user?.id
    if (userApproverLevel && (currentLevel ?? 0) >= userApproverLevel) {
      return { canApprove: false, reason: `You already approved at level ${userApproverLevel}` }
    }
    if (canApprove) return { canApprove, reason: undefined }
    if (!expectedUserId) return { canApprove: false, reason: `No approver configured for level ${level}` }
    if (userApproverLevel && userApproverLevel > level) {
      return { canApprove: false, reason: `Waiting for level ${level} approval` }
    }
    return { canApprove: false, reason: 'Not authorized for this approval level' }
  }

  const workflowByDepartment = new Map<string, ReturnType<typeof resolveWorkflow>>()
  const approvalGates = new Map(
    await Promise.all(requests.map(async request => {
      const departmentId = request.employee.departmentId
      const workflowKey = departmentId ?? ''
      let workflowPromise = workflowByDepartment.get(workflowKey)
      if (!workflowPromise) {
        workflowPromise = resolveWorkflow({ companyId, type: 'LEAVE', departmentId })
        workflowByDepartment.set(workflowKey, workflowPromise)
      }

      const workflow = await workflowPromise
      if (!workflow) {
        return [request.id, legacyApprovalGate(request.approvalLevel)] as const
      }

      const currentLevel = request.approvalLevel ?? 0
      const plan = buildPlan(workflow, {
        totalDays: request.totalDays.toNumber(),
        leaveType: request.leaveType.name,
        isWithPay: request.leaveType.isWithPay,
        isHalfDay: request.isHalfDay,
        departmentId: departmentId ?? '',
      })
      const advance = await authorizeAdvance({
        plan,
        currentLevel,
        actorUserId: session.user.id,
        requesterDepartmentId: departmentId,
        requesterEmployeeId: request.employee.id,
      })
      const canApprove = advance.noChain || advance.authorized
      const reason = canApprove
        ? undefined
        : advance.currentStep
          ? 'Not authorized for this approval level'
          : `No approver configured for level ${currentLevel + 1}`

      return [request.id, { canApprove, reason }] as const
    })),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Requests"
        subtitle="Review employee leave, track approvals, and plan team availability."
        actions={
          <div className="flex flex-wrap gap-2">
          <Link href="/leaves/calendar"><Button variant="outline" size="sm"><CalendarDays className="h-4 w-4 mr-2" />Team calendar</Button></Link>
          <Link href="/leaves/my-leaves" data-tour="leave-file">
            <Button variant="accent" size="sm">
              <Plus className="mr-2 w-4 h-4" />
              File Leave
            </Button>
          </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Total requests" value={total} icon={<CalendarDays />} hint="All leave requests" />
        <KpiCard label="Pending review" value={count('PENDING')} icon={<Clock3 />} tone="accent" hint="Awaiting approval" />
        <KpiCard label="Approved" value={count('APPROVED')} icon={<CheckCircle2 />} hint="Approved leave requests" />
        <KpiCard label="Rejected / cancelled" value={count('REJECTED') + count('CANCELLED')} icon={<XCircle />} hint="Closed without approval" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="font-semibold text-primary">Employee requests</h2><p className="mt-1 text-xs text-slate-500">Select a request to view its details and approval progress.</p></div>
          <form action="/leaves" className="flex w-full gap-2 lg:max-w-md">
            {status && <input type="hidden" name="status" value={status} />}
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input name="q" defaultValue={query} aria-label="Search leave requests" placeholder="Employee, number or leave type" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" /></div>
            <Button type="submit" className="h-10">Search</Button>
            {query && <Link href={status ? `/leaves?status=${status}` : '/leaves'} className="self-center text-xs text-primary underline">Clear</Link>}
          </form>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {['', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map(value => <Link key={value || 'all'} href={filterUrl(value)} data-app-tab data-active={(status ?? '') === value} aria-current={(status ?? '') === value ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${(status ?? '') === value ? 'bg-[#ff5900] text-white' : 'bg-slate-50 text-slate-600 hover:bg-orange-50'}`}>
            {value ? value.charAt(0) + value.slice(1).toLowerCase() : 'All requests'}<span data-tab-counter className="rounded-md bg-white/20 px-1.5 tabular-nums">{value ? count(value) : total}</span>
          </Link>)}
        </div>
      </div>

      <Card className="gap-0 overflow-hidden rounded-2xl border-slate-200 py-0 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><p className="text-xs text-slate-500">Showing {requests.length} most recent matching requests (up to 50)</p>{permissions.includes('payroll:read') && <Link href="/leaves/encashments" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">Leave encashment<ArrowUpRight className="h-3.5 w-3.5" /></Link>}</div>
          {requests.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="w-6 h-6" />}
              title="No leave requests"
              description={query ? 'Try another employee name, number or leave type.' : status ? `No requests in ${status.toLowerCase()} status yet.` : 'Employee leave requests will show up here.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/80 text-[11px] uppercase tracking-wide">
                    <th className="text-left p-4 font-semibold text-gray-600">Employee</th>
                    <th className="text-left p-4 font-semibold text-gray-600 hidden sm:table-cell">Leave Type</th>
                    <th className="text-left p-4 font-semibold text-gray-600 hidden md:table-cell">Period</th>
                    <th className="text-center p-4 font-semibold text-gray-600 hidden sm:table-cell">Days</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Status</th>
                    <th className="text-left p-4 font-semibold text-gray-600 hidden lg:table-cell">Filed On</th>
                    <th className="w-12 p-4" aria-label="Open details" />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => {
                    const gate = approvalGates.get(req.id) ?? {
                      canApprove: false,
                      reason: 'Approval availability could not be determined',
                    }
                    return (
                      <LeaveRowOpener
                        key={req.id}
                        request={{
                          id: req.id,
                          status: req.status as 'PENDING' | 'APPROVED' | 'REJECTED',
                          approvalLevel: req.approvalLevel,
                          startDate: req.startDate.toISOString(),
                          endDate: req.endDate.toISOString(),
                          totalDays: req.totalDays.toString(),
                          reason: req.reason,
                          reviewNotes: req.reviewNotes,
                          isHalfDay: req.isHalfDay,
                          halfDayPeriod: req.halfDayPeriod,
                          halfDayWindow: req.halfDayWindow,
                          createdAt: req.createdAt.toISOString(),
                          employee: req.employee,
                          leaveType: req.leaveType,
                        }}
                        canApprove={isHR && gate.canApprove}
                        approveDisabledReason={gate.reason}
                        isHR={isHR}
                      >
                        <td className="border-b border-slate-100 p-4">
                          <p className="font-semibold text-primary">{req.employee.lastName}, {req.employee.firstName}</p>
                          <p className="text-xs text-gray-500">{req.employee.employeeNo} · {req.employee.department?.name}</p>
                          <div className="mt-2 space-y-1 text-xs text-slate-500 sm:hidden"><p>{req.leaveType.name} &middot; {req.totalDays.toString()} day(s)</p><p>{formatDate(req.startDate)} &ndash; {formatDate(req.endDate)}</p></div>
                        </td>
                        <td className="border-b border-slate-100 p-4 hidden sm:table-cell">
                          <p className="font-medium">{req.leaveType.name}</p>
                          <Badge variant="outline" className="text-xs mt-0.5">
                            {req.leaveType.isWithPay ? 'With Pay' : 'Without Pay'}
                          </Badge>
                        </td>
                        <td className="border-b border-slate-100 p-4 text-gray-600 hidden md:table-cell">
                          <p>{formatDate(req.startDate)}</p><p className="mt-1 text-xs text-slate-400">to {formatDate(req.endDate)}</p>
                        </td>
                        <td className="border-b border-slate-100 p-4 text-center font-medium hidden sm:table-cell">{req.totalDays.toString()}</td>
                        <td className="border-b border-slate-100 p-4">
                          <Badge status={req.status} className="text-xs border-0 whitespace-nowrap">
                            {req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                          </Badge>
                        </td>
                        <td className="border-b border-slate-100 p-4 text-gray-500 text-xs hidden lg:table-cell">{formatDate(req.createdAt)}</td>
                        <td className="border-b border-slate-100 p-4 text-slate-400">
                          <ChevronRight className="h-4 w-4" />
                        </td>
                      </LeaveRowOpener>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
