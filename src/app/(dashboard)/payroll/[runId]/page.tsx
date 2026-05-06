import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ComputePayrollButton } from '@/components/payroll/ComputePayrollButton'
import PayrollActionButtons from '@/components/payroll/PayrollActionButtons'
import { PayrollRunPayslips } from '@/components/payroll/PayrollRunPayslips'
import { formatDate, getStatusColor, formatCurrency } from '@/lib/utils'
import {Users, TrendingDown} from 'lucide-react'
import { PesoIcon } from '@/components/ui/PesoIcon'

export default async function PayrollRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')

  const [run, company] = await Promise.all([
    prisma.payrollRun.findFirst({ where: { id: runId, companyId } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { payrollCurrency: true } }),
  ])
  if (!run) redirect('/payroll')
  const currency = company?.payrollCurrency ?? 'PHP'
  const peso = (n: number | { toNumber: () => number }) => formatCurrency(typeof n === 'number' ? n : n.toNumber(), currency)

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
      incomes: {
        select: { typeName: true, amount: true, incomeTypeId: true },
      },
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
            <div className="p-2 bg-[#D4D8DD] rounded-lg">
              <Users className="w-5 h-5 text-[#2E4156]" />
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
            <div className="p-2 bg-[#D4D8DD] rounded-lg">
              <PesoIcon className="w-5 h-5 text-[#2E4156]" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Net Pay</p>
              <p className="text-lg font-bold text-[#2E4156]">{peso(run.totalNetPay.toNumber())}</p>
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
              <div className="text-center p-3 bg-[#D4D8DD] rounded-lg">
                <p className="text-sm font-medium text-[#1A2D42]">SSS Employer</p>
                <p className="text-lg font-bold text-[#1A2D42]">{peso(run.totalSssEr.toNumber())}</p>
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
          <PayrollRunPayslips
            runStatus={run.status}
            totalBasic={run.totalBasic.toNumber()}
            totalGross={run.totalGross.toNumber()}
            totalDeductions={run.totalDeductions.toNumber()}
            totalNetPay={run.totalNetPay.toNumber()}
            payslips={payslips.map(ps => ({
              id: ps.id,
              basicSalary:        ps.basicSalary.toNumber(),
              regularOtAmount:    ps.regularOtAmount.toNumber(),
              restDayOtAmount:    ps.restDayOtAmount.toNumber(),
              holidayOtAmount:    ps.holidayOtAmount.toNumber(),
              nightDiffAmount:    ps.nightDiffAmount.toNumber(),
              holidayPayAmount:   ps.holidayPayAmount.toNumber(),
              otherEarnings:      ps.otherEarnings.toNumber(),
              grossPay:           ps.grossPay.toNumber(),
              sssEmployee:        ps.sssEmployee.toNumber(),
              sssEc:              ps.sssEc.toNumber(),
              philhealthEmployee: ps.philhealthEmployee.toNumber(),
              pagibigEmployee:    ps.pagibigEmployee.toNumber(),
              withholdingTax:     ps.withholdingTax.toNumber(),
              sssLoanDeduction:   ps.sssLoanDeduction.toNumber(),
              pagibigLoan:        ps.pagibigLoan.toNumber(),
              companyLoan:        ps.companyLoan.toNumber(),
              lateDeduction:      ps.lateDeduction.toNumber(),
              undertimeDeduction: ps.undertimeDeduction.toNumber(),
              absenceDeduction:   ps.absenceDeduction.toNumber(),
              otherDeductions:    ps.otherDeductions.toNumber(),
              totalDeductions:    ps.totalDeductions.toNumber(),
              netPay:             ps.netPay.toNumber(),
              incomes: ps.incomes.map(i => ({ typeName: i.typeName, amount: i.amount.toNumber() })),
              employee: ps.employee,
            }))}
          />
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

