import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays, Plus } from 'lucide-react'
import { formatDate, getStatusColor } from '@/lib/utils'
import { LeaveRowOpener } from '@/components/leaves/LeaveRowOpener'
import { ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { authorizeAdvance, buildPlan, resolveWorkflow } from '@/lib/approvals/engine'

export default async function LeavesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId
  if (!companyId) redirect('/login')
  const role = session.user.role

  const status = params.status || undefined
  const isHR = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN'].includes(role ?? '')

  const requests = await prisma.leaveRequest.findMany({
    where: {
      status: status ? (status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED') : undefined,
      employee: { companyId },
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
        subtitle={`${requests.length} total ${requests.length === 1 ? 'request' : 'requests'}`}
        actions={
          <Link href="/leaves/my-leaves">
            <Button variant="accent" size="sm">
              <Plus className="mr-2 w-4 h-4" />
              File Leave
            </Button>
          </Link>
        }
      />

      {/* Filter */}
      <div className="flex gap-2">
        {['', 'PENDING', 'APPROVED', 'REJECTED'].map(s => (
          <Link key={s || 'all'} href={s ? `?status=${s}` : '/leaves'}>
            <Button
              variant={status === s || (!status && !s) ? 'default' : 'outline'}
              size="sm"
            >
              {s || 'All'}
            </Button>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="w-6 h-6" />}
              title="No leave requests"
              description={status ? `No requests in ${status.toLowerCase()} status yet.` : 'Employee leave requests will show up here.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-4 font-semibold text-gray-600">Employee</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Leave Type</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Period</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Days</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Status</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Filed On</th>
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
                          createdAt: req.createdAt.toISOString(),
                          employee: req.employee,
                          leaveType: req.leaveType,
                        }}
                        canApprove={gate.canApprove}
                        approveDisabledReason={gate.reason}
                        isHR={isHR}
                      >
                        <td className="border-b border-slate-100 p-4">
                          <p className="font-medium">{req.employee.lastName}, {req.employee.firstName}</p>
                          <p className="text-xs text-gray-500">{req.employee.employeeNo} · {req.employee.department?.name}</p>
                        </td>
                        <td className="border-b border-slate-100 p-4">
                          <p className="font-medium">{req.leaveType.name}</p>
                          <Badge variant="outline" className="text-xs mt-0.5">
                            {req.leaveType.isWithPay ? 'With Pay' : 'Without Pay'}
                          </Badge>
                        </td>
                        <td className="border-b border-slate-100 p-4 text-gray-600">
                          {formatDate(req.startDate)} – {formatDate(req.endDate)}
                        </td>
                        <td className="border-b border-slate-100 p-4 text-center font-medium">{req.totalDays.toString()}</td>
                        <td className="border-b border-slate-100 p-4">
                          <Badge className={`text-xs border-0 ${getStatusColor(req.status)}`}>
                            {req.status}
                          </Badge>
                        </td>
                        <td className="border-b border-slate-100 p-4 text-gray-500 text-xs">{formatDate(req.createdAt)}</td>
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
