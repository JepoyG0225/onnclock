import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays, Plus } from 'lucide-react'
import { formatDate, getStatusColor } from '@/lib/utils'
import { LeaveApprovalButtons } from '@/components/leaves/LeaveApprovalButtons'

export default async function LeavesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session?.user?.companyId!
  const role = session?.user?.role

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
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeNo: true,
          department: { select: { name: true } },
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
  function approvalGate(currentLevel: number | null) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="text-gray-500 mt-1">{requests.length} total requests</p>
        </div>
        <Link href="/leaves/my-leaves">
          <Button>
            <Plus className="mr-2 w-4 h-4" />
            File Leave
          </Button>
        </Link>
      </div>

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
            <div className="text-center py-16">
              <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No leave requests</p>
            </div>
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
                    {isHR && <th className="text-center p-4 font-semibold text-gray-600">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <p className="font-medium">{req.employee.lastName}, {req.employee.firstName}</p>
                        <p className="text-xs text-gray-500">{req.employee.employeeNo} · {req.employee.department?.name}</p>
                      </td>
                      <td className="p-4">
                        <p className="font-medium">{req.leaveType.name}</p>
                        <Badge variant="outline" className="text-xs mt-0.5">
                          {req.leaveType.isWithPay ? 'With Pay' : 'Without Pay'}
                        </Badge>
                      </td>
                      <td className="p-4 text-gray-600">
                        {formatDate(req.startDate)} – {formatDate(req.endDate)}
                      </td>
                      <td className="p-4 text-center font-medium">{req.totalDays.toString()}</td>
                      <td className="p-4">
                        <Badge className={`text-xs border-0 ${getStatusColor(req.status)}`}>
                          {req.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-gray-500 text-xs">{formatDate(req.createdAt)}</td>
                      {isHR && (
                        <td className="p-4 text-center">
                          {req.status === 'PENDING' && (
                            <LeaveApprovalButtons
                              requestId={req.id}
                              {...approvalGate(req.approvalLevel ?? 0)}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
