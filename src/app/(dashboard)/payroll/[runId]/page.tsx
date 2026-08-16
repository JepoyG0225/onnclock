import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ComputePayrollButton } from '@/components/payroll/ComputePayrollButton'
import PayrollActionButtons from '@/components/payroll/PayrollActionButtons'
import { PayrollRunPayslips } from '@/components/payroll/PayrollRunPayslips'
import { PayrollPayslipsLoader } from '@/components/payroll/PayrollPayslipsLoader'
import { PayrollWorkflowStepper } from '@/components/payroll/PayrollWorkflowStepper'
import { formatDate, getStatusColor, formatCurrency } from '@/lib/utils'
import { resolveWorkflow, buildPlan, authorizeAdvance } from '@/lib/approvals/engine'
import {Users, TrendingDown, AlertTriangle, Clock3, ClipboardCheck} from 'lucide-react'
import Link from 'next/link'
import { PesoIcon } from '@/components/ui/PesoIcon'
import PayrollActivityLog from '@/components/payroll/PayrollActivityLog'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { ProcessPayrollButton } from '@/components/payroll/ProcessPayrollButton'
import { PayrollAnomalyPanel } from '@/components/payroll/PayrollAnomalyPanel'
import { findPayrollAnomalies } from '@/lib/payroll/anomalies'

export default async function PayrollRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>
  searchParams: Promise<{ stage?: string; compute?: string }>
}) {
  const { runId } = await params
  const { stage, compute } = await searchParams
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')

  const [run, company] = await Promise.all([
    prisma.payrollRun.findFirst({ where: { id: runId, companyId } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { payrollCurrency: true } }),
  ])
  if (!run) redirect('/payroll')
  // Direct links and old bookmarks should resume an unfinished draft at the
  // first incomplete step even when they do not include the stage query.
  const isInputsStage = stage === 'inputs' || (!stage && run.status === 'DRAFT')
  const currency = company?.payrollCurrency ?? 'PHP'
  const permissions = await getEffectivePermissions(session.user.role, companyId, session.user.id)
  const canWritePayroll = permissions.includes('payroll:write') || session.user.role === 'SUPER_ADMIN'
  const peso = (n: number | { toNumber: () => number }) => formatCurrency(typeof n === 'number' ? n : n.toNumber(), currency)

  // Compute canApprove via the same path the POST handler uses
  // (src/app/api/payroll/[runId]/approve/route.ts) so the button's
  // enabled state never disagrees with what the API will actually do.
  // Prefer the configurable Workflow Builder workflow; fall back to the
  // legacy ApproverConfig chain only when no PAYROLL workflow exists.
  const workflow = await resolveWorkflow({ companyId, type: 'PAYROLL', departmentId: null })
  const currentLevel = run.approvalLevel ?? 0
  const nextLevel = currentLevel + 1

  let canApprove = false
  let approveDisabledReason = 'Not authorized for this approval level'
  if (workflow) {
    const plan = buildPlan(workflow, { totalGross: Number(run.totalGross) })
    if (plan.approvalSteps.length === 0) {
      // Workflow exists but has no approval gate (e.g. notify-only) —
      // any role-passing user can finalize. Match POST handler.
      canApprove = true
    } else {
      const adv = await authorizeAdvance({
        plan,
        currentLevel,
        actorUserId: session.user.id,
        requesterDepartmentId: null,
      })
      canApprove = adv.authorized
      if (!canApprove && !adv.currentStep) {
        approveDisabledReason = `No approver configured for level ${nextLevel}`
      }
    }
  } else {
    const approvers = await prisma.approverConfig.findMany({
      where: { companyId, type: 'PAYROLL' },
      orderBy: { level: 'asc' },
    })
    const approverByLevel = new Map(approvers.map(a => [a.level, a.userId]))
    const userApproverLevel = approvers.find(a => a.userId === session.user.id)?.level ?? null
    const expectedUserId = approverByLevel.get(nextLevel)
    canApprove = !!expectedUserId && expectedUserId === session.user.id
    if (!expectedUserId) {
      approveDisabledReason = `No approver configured for level ${nextLevel}`
    } else if (userApproverLevel && userApproverLevel > nextLevel) {
      approveDisabledReason = `Waiting for level ${nextLevel} approval`
    }
  }

  const holidaysInPeriod = await prisma.holiday.findMany({
    where: {
      companyId,
      date: { gte: run.periodStart, lte: run.periodEnd },
    },
    select: { date: true, name: true, type: true },
    orderBy: { date: 'asc' },
  })

  // DTR rows for every employee on this run, scoped to the run's period.
  // Used by the per-day breakdown inside the expandable payslip row.
  // Fetched once at the page level (instead of lazy-loading per row) since
  // a typical run is ~15 employees × ~15 days = ~225 rows = trivial payload.
  const dtrRows = await prisma.dTRRecord.findMany({
    where: {
      employee: { companyId },
      date: { gte: run.periodStart, lte: run.periodEnd },
    },
    select: {
      employeeId: true, date: true,
      timeIn: true, timeOut: true,
      regularHours: true, overtimeHours: true, nightDiffHours: true,
      lateMinutes: true, undertimeMinutes: true,
      isAbsent: true, isLeave: true, isLeavePaid: true,
      isHoliday: true, holidayType: true,
    },
    orderBy: { date: 'asc' },
  })

  // Pre-payroll readiness flags: attendance and OT in this period that still
  // need sign-off. Surfaced so admins don't finalize a run on top of
  // unreviewed timesheets / pending overtime.
  const [unapprovedTimesheets, pendingOtCount] = await Promise.all([
    prisma.dTRRecord.count({
      where: {
        employee: { companyId },
        date: { gte: run.periodStart, lte: run.periodEnd },
        timeOut: { not: null },     // completed attendance that warrants review
        approvedBy: null,           // not yet approved
        NOT: { remarks: 'REJECTED' },
      },
    }),
    prisma.overtimeRequest.count({
      where: { companyId, status: 'PENDING', date: { gte: run.periodStart, lte: run.periodEnd } },
    }),
  ])
  const showReadinessWarning =
    (unapprovedTimesheets > 0 || pendingOtCount > 0) &&
    run.status !== 'APPROVED' && run.status !== 'LOCKED' && run.status !== 'CANCELLED'

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
          // Needed for the per-row gross-pay breakdown — the label
          // changes depending on whether the employee is paid by
          // hour / day / month.
          rateType: true,
          trackTime: true,
          disableLateDeduction: true,
          sssEnabled: true,
          philhealthEnabled: true,
          pagibigEnabled: true,
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      },
    },
    orderBy: { employee: { lastName: 'asc' } },
  })
  const [previousRun, payrollConfig] = await Promise.all([
    prisma.payrollRun.findFirst({
      where: { companyId, periodStart: { lt: run.periodStart }, status: { not: 'CANCELLED' } },
      orderBy: { periodStart: 'desc' },
      select: { payslips: { select: { employeeId: true, grossPay: true, netPay: true } } },
    }),
    prisma.payrollCycleConfig.findUnique({ where: { companyId }, select: { disableLateDeductions: true } }),
  ])
  const lateMinutesByEmployee = new Map<string, number>()
  const dtrCountByEmployee = new Map<string, number>()
  for (const row of dtrRows) {
    lateMinutesByEmployee.set(row.employeeId, (lateMinutesByEmployee.get(row.employeeId) ?? 0) + (row.lateMinutes ?? 0))
    dtrCountByEmployee.set(row.employeeId, (dtrCountByEmployee.get(row.employeeId) ?? 0) + 1)
  }
  const anomalies = findPayrollAnomalies({
    current: payslips.map(item => ({
      employeeId: item.employeeId,
      employeeName: `${item.employee.firstName} ${item.employee.lastName}`,
      grossPay: Number(item.grossPay), netPay: Number(item.netPay), basicPay: Number(item.basicSalary),
      lateDeduction: Number(item.lateDeduction), sssEmployee: Number(item.sssEmployee),
      philhealthEmployee: Number(item.philhealthEmployee), pagibigEmployee: Number(item.pagibigEmployee),
      withholdingTax: Number(item.withholdingTax), trackTime: item.employee.trackTime,
      disableLateDeduction: item.employee.disableLateDeduction, sssEnabled: item.employee.sssEnabled,
      philhealthEnabled: item.employee.philhealthEnabled, pagibigEnabled: item.employee.pagibigEnabled,
    })),
    previous: previousRun?.payslips.map(item => ({ employeeId: item.employeeId, grossPay: Number(item.grossPay), netPay: Number(item.netPay) })) ?? [],
    lateMinutesByEmployee, dtrCountByEmployee,
    companyLateDeductionsDisabled: payrollConfig?.disableLateDeductions ?? false,
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
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-gray-200 bg-white sm:grid-cols-3">
        {[
          { number: 1, label: 'Payroll Period', detail: 'Payroll scope selected', href: `/payroll/new?runId=${run.id}`, active: false },
          { number: 2, label: 'Payroll Inputs', detail: 'Calculate and adjust', href: `/payroll/${run.id}?stage=inputs`, active: isInputsStage },
          { number: 3, label: 'Payroll Summary', detail: 'Review and finalize', href: `/payroll/${run.id}`, active: !isInputsStage },
        ].map((item, index) => (
          <Link
            key={item.number}
            href={item.href}
            className={`flex items-center gap-3 px-5 py-4 transition-colors hover:bg-blue-50 ${index > 0 ? 'border-t sm:border-l sm:border-t-0' : ''} ${item.active ? 'bg-blue-50' : ''}`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${item.active ? 'bg-[var(--brand-primary)] text-white' : item.number === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {item.number === 1 ? '✓' : item.number}
            </span>
            <span>
              <span className="block text-sm font-semibold text-[#1f2937]">{item.label}</span>
              <span className="block text-xs text-gray-500">{item.detail}</span>
            </span>
          </Link>
        ))}
      </div>
      {/* Header
          ───
          Title + period on the left, status pill on the right, then a
          tight cluster of actions:
            • ComputePayrollButton  (only while editable)
            • Primary workflow CTA  (Submit / Approve / Lock / Unlock)
            • ⋯ More menu           (Download Excel, Delete)
          A small pipeline stepper sits below as visual context for where
          the run currently is. */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isInputsStage ? 'Payroll Inputs' : 'Payroll Summary'}</h1>
            <p className="text-gray-600 mt-1">
              {run.periodLabel}
              <span className="mx-2 text-gray-300">·</span>
              <span className="text-gray-500">Pay date {formatDate(run.payDate)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-sm border-0 ${getStatusColor(run.status)}`}>
              {STATUS_LABELS[run.status]}
            </Badge>
            {isInputsStage && canWritePayroll && (run.status === 'DRAFT' || run.status === 'COMPUTED' || run.status === 'FOR_APPROVAL') && (
              <ComputePayrollButton
                runId={run.id}
                status={run.status}
                autoStart={compute === '1' && run.status === 'DRAFT'}
              />
            )}
            {!isInputsStage && <PayrollActionButtons
              runId={run.id}
              status={run.status}
              periodLabel={run.periodLabel}
              canApprove={run.status !== 'FOR_APPROVAL' ? true : canApprove}
              approveDisabledReason={run.status !== 'FOR_APPROVAL' ? undefined : approveDisabledReason}
            />}
          </div>
        </div>
        {isInputsStage ? (
          <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#1f2937]">Review each employee&apos;s calculated payroll</p>
              <p className="mt-0.5 text-xs text-gray-600">Use the edit icon to add income, deductions, or manual adjustments before generating the summary.</p>
            </div>
            {payslips.length > 0 && (
              <ProcessPayrollButton runId={run.id} />
            )}
          </div>
        ) : <PayrollWorkflowStepper status={run.status} />}
      </div>

      {/* Pre-payroll readiness warning */}
      {showReadinessWarning && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                Items in this pay period still need approval
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Review and approve these before finalizing — they affect what this run pays. Recompute after approving.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {unapprovedTimesheets > 0 && (
                  <Link
                    href="/timesheets"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    {unapprovedTimesheets} unapproved timesheet{unapprovedTimesheets !== 1 ? 's' : ''}
                  </Link>
                )}
                {pendingOtCount > 0 && (
                  <Link
                    href="/timesheets"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    <Clock3 className="w-3.5 h-3.5" />
                    {pendingOtCount} pending overtime request{pendingOtCount !== 1 ? 's' : ''}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isInputsStage && <>
      <PayrollAnomalyPanel anomalies={anomalies} />
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2 ring-1 ring-inset ring-blue-100">
              <Users className="h-5 w-5 text-[var(--brand-primary)]" />
            </div>
            <div>
              <p className="text-xs font-medium text-black">Employees</p>
              <p className="text-xl font-black text-[#343434]">{payslips.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 ring-1 ring-inset ring-emerald-100">
              <PesoIcon className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-black">Gross Pay</p>
              <p className="text-lg font-black text-[#343434]">{peso(run.totalGross.toNumber())}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-rose-50 p-2 ring-1 ring-inset ring-rose-100">
              <TrendingDown className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-black">Total Deductions</p>
              <p className="text-lg font-bold text-red-600">{peso(run.totalDeductions.toNumber())}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-cyan-50 p-2 ring-1 ring-inset ring-cyan-100">
              <PesoIcon className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-black">Net Pay</p>
              <p className="text-lg font-black text-[#343434]">{peso(run.totalNetPay.toNumber())}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employer Contributions */}
      {payslips.length > 0 && (
        <Card className="overflow-hidden py-0">
          <CardHeader className="border-b bg-white px-6 py-4"><CardTitle className="text-base !text-[#343434]">Employer Contributions (Company Share)</CardTitle></CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 border-t-4 border-t-[var(--brand-highlight)] bg-white p-4 text-center">
                <p className="text-sm font-medium text-[#343434]">SSS Employer</p>
                <p className="text-lg font-black text-[#343434]">{peso(run.totalSssEr.toNumber())}</p>
              </div>
              <div className="rounded-xl border border-gray-200 border-t-4 border-t-[var(--brand-highlight)] bg-white p-4 text-center">
                <p className="text-sm font-medium text-[#343434]">PhilHealth Employer</p>
                <p className="text-lg font-black text-[#343434]">{peso(run.totalPhEr.toNumber())}</p>
              </div>
              <div className="rounded-xl border border-gray-200 border-t-4 border-t-[var(--brand-highlight)] bg-white p-4 text-center">
                <p className="text-sm font-medium text-[#343434]">Pag-IBIG Employer</p>
                <p className="text-lg font-black text-[#343434]">{peso(run.totalPagibigEr.toNumber())}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </>}

      {/* Payslip Table */}
      <PayrollPayslipsLoader>
      <Card className="overflow-hidden py-0">
        <CardHeader className="border-b bg-white px-6 py-4">
          <CardTitle className="text-base !text-[#343434]">{isInputsStage ? 'Calculated Payroll Inputs' : 'Individual Payslips'} ({payslips.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <PayrollRunPayslips
            runStatus={run.status}
            allowEdits={isInputsStage && canWritePayroll}
            showPdf={!isInputsStage}
            totalBasic={run.totalBasic.toNumber()}
            totalGross={run.totalGross.toNumber()}
            totalDeductions={run.totalDeductions.toNumber()}
            totalNetPay={run.totalNetPay.toNumber()}
            holidaysInPeriod={holidaysInPeriod.map(h => ({
              date: h.date.toISOString().slice(0, 10),
              name: h.name,
              type: h.type as 'REGULAR' | 'SPECIAL_NON_WORKING',
            }))}
            dtrsByEmployee={(() => {
              const grouped: Record<string, Array<{
                date: string
                regularHours: number
                overtimeHours: number
                nightDiffHours: number
                lateMinutes: number
                undertimeMinutes: number
                isAbsent: boolean
                isLeave: boolean
                isLeavePaid: boolean
                isHoliday: boolean
                holidayType: string | null
              }>> = {}
              for (const d of dtrRows) {
                const eid = d.employeeId
                if (!grouped[eid]) grouped[eid] = []
                grouped[eid].push({
                  date: d.date.toISOString().slice(0, 10),
                  regularHours: d.regularHours?.toNumber() ?? 0,
                  overtimeHours: d.overtimeHours?.toNumber() ?? 0,
                  nightDiffHours: d.nightDiffHours?.toNumber() ?? 0,
                  lateMinutes: d.lateMinutes ?? 0,
                  undertimeMinutes: d.undertimeMinutes ?? 0,
                  isAbsent: d.isAbsent,
                  isLeave: d.isLeave,
                  isLeavePaid: d.isLeavePaid,
                  isHoliday: d.isHoliday,
                  holidayType: d.holidayType ?? null,
                })
              }
              return grouped
            })()}
            payslips={payslips.map(ps => ({
              id: ps.id,
              basicSalary:        ps.basicSalary.toNumber(),
              // Hours / day counters used by the expandable breakdown
              dailyRate:          ps.dailyRate.toNumber(),
              daysWorked:         ps.daysWorked.toNumber(),
              hoursWorked:        ps.hoursWorked.toNumber(),
              regularOtHours:     ps.regularOtHours.toNumber(),
              restDayOtHours:     ps.restDayOtHours.toNumber(),
              holidayOtHours:     ps.holidayOtHours.toNumber(),
              nightDiffHours:     ps.nightDiffHours.toNumber(),
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
              customIncomes: (() => {
                const edits = ps.manualEdits as { customIncomes?: Array<{ label: string; amount: number }> } | null
                return Array.isArray(edits?.customIncomes) ? edits.customIncomes : []
              })(),
              customDeductions: (() => {
                const edits = ps.manualEdits as { customDeductions?: Array<{ label: string; amount: number }> } | null
                return Array.isArray(edits?.customDeductions) ? edits.customDeductions : []
              })(),
              employee: ps.employee,
            }))}
          />
        </CardContent>
      </Card>
      </PayrollPayslipsLoader>

      {!isInputsStage && <>
      {/* Activity Log */}
      <PayrollActivityLog runId={run.id} />

      {/* Pay Details */}
      {(() => {
        const scope = run as unknown as {
          payGroupLabel?: string | null
          employeeScopeMode?: string | null
          employmentTypeFilter?: string[] | null
          employeeIds?: string[] | null
        }
        const scopeText = (() => {
          if (scope.employeeScopeMode === 'EMPLOYMENT_TYPE' && (scope.employmentTypeFilter?.length ?? 0) > 0) {
            return `Employment type: ${scope.employmentTypeFilter!.map(t => t.replace('_', ' ').toLowerCase()).join(', ')}`
          }
          if (scope.employeeScopeMode === 'CUSTOM' && (scope.employeeIds?.length ?? 0) > 0) {
            return `Custom (${scope.employeeIds!.length} selected employees)`
          }
          return 'All active employees'
        })()
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
            <div>
              <span className="font-medium">Pay Date:</span> {formatDate(run.payDate)}
            </div>
            <div>
              <span className="font-medium">Created:</span> {formatDate(run.createdAt)}
            </div>
            <div>
              <span className="font-medium">Scope:</span> {scopeText}
            </div>
            {scope.payGroupLabel && (
              <div className="md:col-span-3">
                <span className="font-medium">Pay Group:</span>{' '}
                <span className="font-semibold text-[#c44d00] bg-orange-50 inline-block px-1.5 py-0.5 rounded">
                  {scope.payGroupLabel}
                </span>
              </div>
            )}
          </div>
        )
      })()}
      </>}
    </div>
  )
}

