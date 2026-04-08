import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ComputePayrollButton } from '@/components/payroll/ComputePayrollButton'
import PayrollActionButtons from '@/components/payroll/PayrollActionButtons'
import { peso, formatDate, getStatusColor } from '@/lib/utils'
import {Users, TrendingDown} from 'lucide-react'
import { PesoIcon } from '@/components/ui/PesoIcon'

export default async function PayrollRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId!

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId },
  })
  if (!run) redirect('/payroll')

  const approvers = await prisma.approverConfig.findMany({
    where: { companyId, type: 'PAYROLL' },
    orderBy: { level: 'asc' },
  })
  const approverByLevel = new Map(approvers.map(a => [a.level, a.userId]))
  const userApproverLevel = approvers.find(a => a.userId === session.user.id)?.level ?? null
  const nextLevel = (run.approvalLevel ?? 0) + 1
  const expectedUserId = approverByLevel.get(nextLevel)
  const canApprove = !!expectedUserId && expectedUserId === session.user.id
  const approveDisabledReason = !expectedUserId
    ? `No approver configured for level ${nextLevel}`
    : userApproverLevel && userApproverLevel > nextLevel
      ? `Waiting for level ${nextLevel} approval`
      : 'Not authorized for this approval level'

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
    },
    orderBy: { employee: { lastName: 'asc' } },
  })

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft',
    COMPUTED: 'Computed',
    FOR_APPROVAL: 'For Approval',
    APPROVED: 'Approved',
    LOCKED: 'Locked',
    CANCELLED: 'Cancelled',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll Run</h1>
          <p className="text-gray-600 mt-1">{run.periodLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`text-sm border-0 ${getStatusColor(run.status)}`}>
            {STATUS_LABELS[run.status]}
          </Badge>
          {(run.status === 'DRAFT' || run.status === 'COMPUTED') && (
            <ComputePayrollButton runId={run.id} />
          )}
          <PayrollActionButtons
            runId={run.id}
            status={run.status}
            periodLabel={run.periodLabel}
            canApprove={run.status !== 'FOR_APPROVAL' ? true : canApprove}
            approveDisabledReason={run.status !== 'FOR_APPROVAL' ? undefined : approveDisabledReason}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg">
              <Users className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Employees</p>
              <p className="text-xl font-bold">{payslips.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <PesoIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Gross Pay</p>
              <p className="text-lg font-bold text-green-700">{peso(run.totalGross.toNumber())}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Deductions</p>
              <p className="text-lg font-bold text-red-600">{peso(run.totalDeductions.toNumber())}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg">
              <PesoIcon className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Net Pay</p>
              <p className="text-lg font-bold text-teal-700">{peso(run.totalNetPay.toNumber())}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employer Contributions */}
      {payslips.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Employer Contributions (Company Share)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-teal-50 rounded-lg">
                <p className="text-sm font-medium text-teal-800">SSS Employer</p>
                <p className="text-lg font-bold text-teal-900">{peso(run.totalSssEr.toNumber())}</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-sm font-medium text-green-800">PhilHealth Employer</p>
                <p className="text-lg font-bold text-green-900">{peso(run.totalPhEr.toNumber())}</p>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <p className="text-sm font-medium text-yellow-800">Pag-IBIG Employer</p>
                <p className="text-lg font-bold text-yellow-900">{peso(run.totalPagibigEr.toNumber())}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payslip Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Individual Payslips ({payslips.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payslips.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No payslips yet. Click &quot;Compute Payroll&quot; to generate.</p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-gray-50 z-10 min-w-[160px]">Employee</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Basic Pay</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-blue-600">OT Pay</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-purple-600">Holiday Pay</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Gross Pay</th>
                    <th className="text-right px-3 py-2.5 font-semibold">SSS</th>
                    <th className="text-right px-3 py-2.5 font-semibold">PhilHealth</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Pag-IBIG</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Tax</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Loans</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Net Pay</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((ps) => {
                    const otTotal   = ps.regularOtAmount.toNumber() + ps.restDayOtAmount.toNumber() + ps.holidayOtAmount.toNumber()
                    const holidayPay = ps.holidayPayAmount.toNumber()
                    const loanTotal  = ps.sssLoanDeduction.toNumber() + ps.pagibigLoan.toNumber() + ps.companyLoan.toNumber()
                    return (
                      <tr key={ps.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2.5 sticky left-0 bg-white hover:bg-gray-50 z-10">
                          <p className="font-medium">{ps.employee.lastName}, {ps.employee.firstName}</p>
                          <p className="text-xs text-gray-400">{ps.employee.employeeNo} · {ps.employee.position?.title}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right">{peso(ps.basicSalary.toNumber())}</td>
                        <td className="px-3 py-2.5 text-right text-blue-600">
                          {otTotal === 0 ? <span className="text-gray-300">—</span> : peso(otTotal)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-purple-600">
                          {holidayPay === 0 ? <span className="text-gray-300">—</span> : peso(holidayPay)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium">{peso(ps.grossPay.toNumber())}</td>
                        <td className="px-3 py-2.5 text-right text-red-500">{peso(ps.sssEmployee.toNumber())}</td>
                        <td className="px-3 py-2.5 text-right text-red-500">{peso(ps.philhealthEmployee.toNumber())}</td>
                        <td className="px-3 py-2.5 text-right text-red-500">{peso(ps.pagibigEmployee.toNumber())}</td>
                        <td className="px-3 py-2.5 text-right text-red-500">{peso(ps.withholdingTax.toNumber())}</td>
                        <td className="px-3 py-2.5 text-right text-red-500">
                          {loanTotal === 0 ? <span className="text-gray-300">—</span> : peso(loanTotal)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-green-700">{peso(ps.netPay.toNumber())}</td>
                        <td className="px-3 py-2.5 text-center">
                          <a
                            href={`/api/payroll/payslip/${ps.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-500 hover:text-teal-700 text-xs underline"
                          >
                            PDF
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-700 border-t-2 border-gray-200">
                    <td className="px-3 py-2.5 sticky left-0 bg-gray-50 z-10 font-bold">TOTAL</td>
                    <td className="px-3 py-2.5 text-right">{peso(run.totalBasic.toNumber())}</td>
                    <td className="px-3 py-2.5 text-right text-blue-600">
                      {peso(payslips.reduce((s, p) => s + p.regularOtAmount.toNumber() + p.restDayOtAmount.toNumber() + p.holidayOtAmount.toNumber(), 0))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-purple-600">
                      {peso(payslips.reduce((s, p) => s + p.holidayPayAmount.toNumber(), 0))}
                    </td>
                    <td className="px-3 py-2.5 text-right">{peso(run.totalGross.toNumber())}</td>
                    <td className="px-3 py-2.5 text-right text-red-500">
                      {peso(payslips.reduce((s, p) => s + p.sssEmployee.toNumber(), 0))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-red-500">
                      {peso(payslips.reduce((s, p) => s + p.philhealthEmployee.toNumber(), 0))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-red-500">
                      {peso(payslips.reduce((s, p) => s + p.pagibigEmployee.toNumber(), 0))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-red-500">
                      {peso(payslips.reduce((s, p) => s + p.withholdingTax.toNumber(), 0))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-red-500">
                      {(() => {
                        const t = payslips.reduce((s, p) => s + p.sssLoanDeduction.toNumber() + p.pagibigLoan.toNumber() + p.companyLoan.toNumber(), 0)
                        return t === 0 ? <span className="text-gray-300">—</span> : peso(t)
                      })()}
                    </td>
                    <td className="px-3 py-2.5 text-right text-green-700 font-bold">{peso(run.totalNetPay.toNumber())}</td>
                    <td className="px-3 py-2.5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pay Details */}
      <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
        <div>
          <span className="font-medium">Pay Date:</span> {formatDate(run.payDate)}
        </div>
        <div>
          <span className="font-medium">Created:</span> {formatDate(run.createdAt)}
        </div>
      </div>
    </div>
  )
}
