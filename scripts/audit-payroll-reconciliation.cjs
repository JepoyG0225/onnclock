// Read-only audit. Detailed employee amounts stay in the ignored .vercel directory.
require('@next/env').loadEnvConfig(process.cwd())
const fs = require('node:fs')
const { PrismaClient } = require('@prisma/client')
const url = new URL(process.env.DATABASE_URL)
url.searchParams.set('pgbouncer', 'true')
process.env.DATABASE_URL = url.toString()
const db = new PrismaClient()
const n = v => Number(v || 0)
const round = v => Math.round(v * 100) / 100
const sum = (rows, field) => round(rows.reduce((s, r) => s + n(r[field]), 0))
async function main() {
  const companies = await db.company.findMany({ where: { name: { contains: process.argv[2] || 'Loyola', mode: 'insensitive' } }, select: { id: true, name: true } })
  const reports = []
  for (const company of companies) {
    const config = await db.payrollCycleConfig.findUnique({ where: { companyId: company.id } })
    const runs = await db.payrollRun.findMany({ where: { companyId: company.id }, orderBy: { periodStart: 'desc' }, include: { payslips: { include: { employee: { select: { id: true, employeeNo: true, rateType: true, basicSalary: true, dailyRate: true, hourlyRate: true, trackTime: true, disableHolidayPay: true, workSchedule: true } }, incomes: true, loanDeductions: true } } } })
    const runReports = []
    for (const run of runs) {
      const dtrs = await db.dTRRecord.findMany({ where: { employeeId: { in: run.payslips.map(p => p.employeeId) }, date: { gte: run.periodStart, lte: run.periodEnd } }, orderBy: { date: 'asc' } })
      const assignments = await db.employeeShiftAssignment.findMany({ where: { companyId: company.id, date: { gte: run.periodStart, lte: run.periodEnd } }, include: { schedule: true } })
      const holidays = await db.holiday.findMany({ where: { companyId: company.id, date: { gte: run.periodStart, lte: run.periodEnd } } })
      const slips = run.payslips.map(p => {
        const rows = dtrs.filter(d => d.employeeId === p.employeeId)
        const paidDays = rows.reduce((s, d) => s + (d.isAbsent || (d.isLeave && !d.isLeavePaid) ? 0 : d.isHalfDay ? .5 : 1), 0)
        const earningsFields = ['basicSalary','regularOtAmount','restDayOtAmount','holidayOtAmount','nightDiffAmount','holidayPayAmount','riceAllowance','clothingAllowance','medicalAllowance','otherEarnings']
        const deductionFields = ['sssEmployee','philhealthEmployee','pagibigEmployee','withholdingTax','sssLoanDeduction','pagibigLoan','companyLoan','lateDeduction','undertimeDeduction','absenceDeduction','otherDeductions']
        const currentDerivedDaily = p.employee.rateType === 'DAILY' ? n(p.employee.basicSalary) : p.employee.rateType === 'HOURLY' ? n(p.employee.basicSalary) * n(p.employee.workSchedule?.workHoursPerDay || 8) : n(p.employee.basicSalary) / n(config?.workingDaysPerMonth || 22)
        return { employeeNo: p.employee.employeeNo, payslipId: p.id, rateType: p.employee.rateType, basic: n(p.basicSalary), savedDailyRate: n(p.dailyRate), savedDays: n(p.daysWorked), savedHours: n(p.hoursWorked), currentDerivedDaily: round(currentDerivedDaily), currentDtrDays: paidDays, currentDtrHours: sum(rows,'regularHours'), basicVsSavedDays: round(n(p.basicSalary) - n(p.dailyRate)*n(p.daysWorked)), basicVsCurrentRateDays: round(n(p.basicSalary) - currentDerivedDaily*n(p.daysWorked)), basicVsDisplayHours: round(n(p.basicSalary) - n(p.dailyRate)/8*sum(rows,'regularHours')), grossDifference: round(n(p.grossPay)-earningsFields.reduce((s,k)=>s+n(p[k]),0)), deductionDifference: round(n(p.totalDeductions)-deductionFields.reduce((s,k)=>s+n(p[k]),0)), netDifference: round(n(p.netPay)-(n(p.grossPay)-n(p.totalDeductions))), loanDifference: round(sum(p.loanDeductions,'amount')-n(p.sssLoanDeduction)-n(p.pagibigLoan)-n(p.companyLoan)), manualEdits:p.manualEdits, record:p, dtrs:rows, assignments:assignments.filter(a=>a.employeeId===p.employeeId) }
      })
      runReports.push({ id:run.id, period:run.periodStart.toISOString().slice(0,10)+' to '+run.periodEnd.toISOString().slice(0,10), status:run.status, frequency:run.payFrequency, holidays, slips, totalDifferences: {basic:round(n(run.totalBasic)-sum(run.payslips,'basicSalary')),gross:round(n(run.totalGross)-sum(run.payslips,'grossPay')),deductions:round(n(run.totalDeductions)-sum(run.payslips,'totalDeductions')),net:round(n(run.totalNetPay)-sum(run.payslips,'netPay'))} })
    }
    reports.push({company,config,runs:runReports})
  }
  fs.mkdirSync('.vercel',{recursive:true})
  fs.writeFileSync('.vercel/payroll-audit.json',JSON.stringify(reports,null,2))
  console.log(JSON.stringify(reports.map(c=>({company:c.company.name,runs:c.runs.map(r=>({period:r.period,status:r.status,payslips:r.slips.length,totalDifferences:r.totalDifferences,deductionMismatchCount:r.slips.filter(p=>Math.abs(p.deductionDifference)>.01).length,grossMismatchCount:r.slips.filter(p=>Math.abs(p.grossDifference)>.01).length}))})),null,2))
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect())
