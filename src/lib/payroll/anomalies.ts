export type PayrollAnomalySeverity = 'critical' | 'warning' | 'info'

export type PayrollAnomaly = {
  key: string
  severity: PayrollAnomalySeverity
  employeeId?: string
  employeeName?: string
  title: string
  detail: string
}

import { prisma } from '@/lib/prisma'

type CurrentPayslip = {
  employeeId: string
  employeeName: string
  grossPay: number
  netPay: number
  basicPay: number
  lateDeduction: number
  sssEmployee: number
  philhealthEmployee: number
  pagibigEmployee: number
  withholdingTax: number
  trackTime: boolean
  disableLateDeduction: boolean
  sssEnabled: boolean
  philhealthEnabled: boolean
  pagibigEnabled: boolean
}

type PreviousPayslip = { employeeId: string; grossPay: number; netPay: number }

export function findPayrollAnomalies(input: {
  current: CurrentPayslip[]
  previous: PreviousPayslip[]
  lateMinutesByEmployee: Map<string, number>
  dtrCountByEmployee: Map<string, number>
  companyLateDeductionsDisabled: boolean
}): PayrollAnomaly[] {
  const anomalies: PayrollAnomaly[] = []
  const previous = new Map(input.previous.map(item => [item.employeeId, item]))

  for (const row of input.current) {
    const identity = { employeeId: row.employeeId, employeeName: row.employeeName }
    const lateMinutes = input.lateMinutesByEmployee.get(row.employeeId) ?? 0
    const dtrCount = input.dtrCountByEmployee.get(row.employeeId) ?? 0

    if (lateMinutes > 0 && row.lateDeduction === 0 && !row.disableLateDeduction && !input.companyLateDeductionsDisabled) {
      anomalies.push({ key: `${row.employeeId}:late`, severity: 'critical', ...identity, title: 'Late minutes have no deduction', detail: `${lateMinutes} late minute${lateMinutes === 1 ? '' : 's'} recorded, but the payslip deduction is zero. Recompute this run.` })
    }
    if (row.netPay < 0) {
      anomalies.push({ key: `${row.employeeId}:negative`, severity: 'critical', ...identity, title: 'Negative net pay', detail: `Net pay is below zero (${row.netPay.toFixed(2)}). Review deductions before approval.` })
    }
    if (row.trackTime && dtrCount === 0 && row.basicPay > 0) {
      anomalies.push({ key: `${row.employeeId}:nodtr`, severity: 'critical', ...identity, title: 'Paid without DTR records', detail: 'This employee is DTR-based, has positive basic pay, but has no attendance rows in the period.' })
    }
    const missing: string[] = []
    if (row.grossPay > 0 && row.sssEnabled && row.sssEmployee === 0) missing.push('SSS')
    if (row.grossPay > 0 && row.philhealthEnabled && row.philhealthEmployee === 0) missing.push('PhilHealth')
    if (row.grossPay > 0 && row.pagibigEnabled && row.pagibigEmployee === 0) missing.push('Pag-IBIG')
    if (missing.length) {
      anomalies.push({ key: `${row.employeeId}:statutory`, severity: 'warning', ...identity, title: 'Missing statutory deductions', detail: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} enabled but zero on this payslip.` })
    }

    const prior = previous.get(row.employeeId)
    if (prior && prior.netPay > 0) {
      const change = (row.netPay - prior.netPay) / prior.netPay
      if (Math.abs(change) >= 0.3) {
        anomalies.push({ key: `${row.employeeId}:variance`, severity: 'warning', ...identity, title: 'Large net-pay variance', detail: `Net pay is ${Math.abs(change * 100).toFixed(0)}% ${change > 0 ? 'higher' : 'lower'} than the previous payroll run.` })
      }
    } else if (!prior) {
      anomalies.push({ key: `${row.employeeId}:new`, severity: 'info', ...identity, title: 'New to this payroll run', detail: 'No payslip was found for this employee in the previous run.' })
    }
  }

  const currentIds = new Set(input.current.map(item => item.employeeId))
  for (const prior of input.previous) {
    if (!currentIds.has(prior.employeeId)) {
      anomalies.push({ key: `${prior.employeeId}:omitted`, severity: 'warning', employeeId: prior.employeeId, title: 'Employee omitted from run', detail: 'This employee appeared in the previous payroll but is not included in the current run.' })
    }
  }
  return anomalies
}

export async function auditPayrollRun(runId: string, companyId: string): Promise<PayrollAnomaly[]> {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId }, select: { periodStart: true, periodEnd: true } })
  if (!run) return []
  const [payslips, dtrs, previousRun, config] = await Promise.all([
    prisma.payslip.findMany({ where: { payrollRunId: runId }, include: { employee: { select: { firstName:true,lastName:true,trackTime:true,disableLateDeduction:true,sssEnabled:true,philhealthEnabled:true,pagibigEnabled:true } } } }),
    prisma.dTRRecord.findMany({ where: { employee: { companyId }, date: { gte: run.periodStart, lte: run.periodEnd } }, select: { employeeId:true,lateMinutes:true } }),
    prisma.payrollRun.findFirst({ where: { companyId, periodStart: { lt: run.periodStart }, status: { not:'CANCELLED' } }, orderBy: { periodStart:'desc' }, select: { payslips: { select: { employeeId:true,grossPay:true,netPay:true } } } }),
    prisma.payrollCycleConfig.findUnique({ where: { companyId }, select: { disableLateDeductions:true } }),
  ])
  const lateMinutesByEmployee=new Map<string,number>(),dtrCountByEmployee=new Map<string,number>()
  for(const row of dtrs){lateMinutesByEmployee.set(row.employeeId,(lateMinutesByEmployee.get(row.employeeId)??0)+(row.lateMinutes??0));dtrCountByEmployee.set(row.employeeId,(dtrCountByEmployee.get(row.employeeId)??0)+1)}
  return findPayrollAnomalies({current:payslips.map(item=>({employeeId:item.employeeId,employeeName:`${item.employee.firstName} ${item.employee.lastName}`,grossPay:Number(item.grossPay),netPay:Number(item.netPay),basicPay:Number(item.basicSalary),lateDeduction:Number(item.lateDeduction),sssEmployee:Number(item.sssEmployee),philhealthEmployee:Number(item.philhealthEmployee),pagibigEmployee:Number(item.pagibigEmployee),withholdingTax:Number(item.withholdingTax),trackTime:item.employee.trackTime,disableLateDeduction:item.employee.disableLateDeduction,sssEnabled:item.employee.sssEnabled,philhealthEnabled:item.employee.philhealthEnabled,pagibigEnabled:item.employee.pagibigEnabled})),previous:previousRun?.payslips.map(item=>({employeeId:item.employeeId,grossPay:Number(item.grossPay),netPay:Number(item.netPay)}))??[],lateMinutesByEmployee,dtrCountByEmployee,companyLateDeductionsDisabled:config?.disableLateDeductions??false})
}
