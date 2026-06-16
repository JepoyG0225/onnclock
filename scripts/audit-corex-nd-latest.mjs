/**
 * Diagnose why Night Differential hours didn't show up on COREX's latest
 * payroll run. Looks at four things in order:
 *   1. PayrollCycleConfig — is ND globally disabled or rate=0?
 *   2. The latest non-LOCKED payroll run + each payslip's nightDiffHours
 *   3. DTRRecord rows for that period — what's the stored regularHours /
 *      overtimeHours / nightDiffHours vs the raw timeIn/timeOut?
 *   4. Re-derive ND minutes from timestamps in PHT and compare to stored.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

function fmtPht(d) {
  if (!d) return '—'
  // shift UTC → PHT for display only
  const ms = d.getTime() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.000Z$/, ' PHT')
}

function countNightMinutes({ timeIn, timeOut, startMinutes, endMinutes }) {
  let minutes = 0
  const crossesMidnight = startMinutes > endMinutes
  let cursor = new Date(timeIn)
  while (cursor < timeOut) {
    const utcMin = cursor.getUTCHours() * 60 + cursor.getUTCMinutes()
    const phtMin = (utcMin + 8 * 60) % (24 * 60)
    const inWindow = crossesMidnight
      ? phtMin >= startMinutes || phtMin < endMinutes
      : phtMin >= startMinutes && phtMin < endMinutes
    if (inWindow) minutes++
    cursor = new Date(cursor.getTime() + 60_000)
  }
  return minutes
}

const company = await prisma.company.findFirst({
  where: { name: { contains: 'corex', mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (!company) {
  console.log('No COREX company found')
  process.exit(0)
}
console.log(`\n=== ${company.name} (${company.id}) ===\n`)

// 1. Payroll cycle config
const cfg = await prisma.payrollCycleConfig.findUnique({
  where: { companyId: company.id },
  select: {
    enableNightDifferential: true,
    nightDifferentialRate: true,
    nightDifferentialStart: true,
    nightDifferentialEnd: true,
    nightDifferentialIncludesBreak: true,
  },
})
console.log('1. PayrollCycleConfig:')
console.log(JSON.stringify(cfg, null, 2))

// 2. Latest run
const run = await prisma.payrollRun.findFirst({
  where: { companyId: company.id },
  orderBy: { createdAt: 'desc' },
  select: { id: true, periodStart: true, periodEnd: true, status: true, payFrequency: true },
})
if (!run) {
  console.log('No payroll runs found')
  await prisma.$disconnect()
  process.exit(0)
}
console.log(`\n2. Latest run: ${run.id}`)
console.log(`   Period: ${run.periodStart.toISOString().slice(0, 10)} → ${run.periodEnd.toISOString().slice(0, 10)}`)
console.log(`   Status: ${run.status}, Frequency: ${run.payFrequency}`)

const payslips = await prisma.payslip.findMany({
  where: { payrollRunId: run.id },
  select: {
    id: true, employeeId: true, nightDiffHours: true, nightDiffAmount: true,
    employee: { select: { firstName: true, lastName: true, employeeNo: true } },
  },
})
const withNd = payslips.filter(p => Number(p.nightDiffHours) > 0)
console.log(`\n   ${payslips.length} payslips total, ${withNd.length} have nightDiffHours > 0`)
for (const p of payslips.slice(0, 5)) {
  console.log(`   - ${p.employee.lastName}, ${p.employee.firstName} (${p.employee.employeeNo}): ND ${Number(p.nightDiffHours)}h → ₱${Number(p.nightDiffAmount)}`)
}

// 3. Sample a handful of DTRs with timestamps and check actual ND
const sampleEmployees = payslips.slice(0, 5).map(p => p.employeeId)
console.log('\n3. DTR audit for first 5 employees:\n')

for (const empId of sampleEmployees) {
  const emp = payslips.find(p => p.employeeId === empId).employee
  const dtrs = await prisma.dTRRecord.findMany({
    where: {
      employeeId: empId,
      date: { gte: run.periodStart, lte: run.periodEnd },
    },
    select: {
      date: true, timeIn: true, timeOut: true,
      regularHours: true, overtimeHours: true, nightDiffHours: true,
      isAbsent: true,
    },
    orderBy: { date: 'asc' },
  })
  console.log(`-- ${emp.lastName}, ${emp.firstName}: ${dtrs.length} DTRs --`)

  let totalStoredNd = 0
  let totalDerivedNd = 0
  for (const d of dtrs) {
    if (d.isAbsent) continue
    const storedNd = Number(d.nightDiffHours ?? 0)
    let derivedNd = 0
    if (d.timeIn && d.timeOut) {
      const ndMins = countNightMinutes({
        timeIn: d.timeIn,
        timeOut: d.timeOut,
        startMinutes: 22 * 60,
        endMinutes: 6 * 60,
      })
      derivedNd = Math.round((ndMins / 60) * 100) / 100
    }
    totalStoredNd += storedNd
    totalDerivedNd += derivedNd
    const flag = Math.abs(storedNd - derivedNd) > 0.05 ? '  ⚠ MISMATCH' : ''
    if (d.timeIn && d.timeOut) {
      console.log(
        `   ${d.date.toISOString().slice(0, 10)} ` +
        `${fmtPht(d.timeIn).slice(11, 16)}–${fmtPht(d.timeOut).slice(11, 16)} PHT  ` +
        `stored ND ${storedNd}h / derived ${derivedNd}h${flag}`
      )
    }
  }
  console.log(`   TOTALS: stored ${totalStoredNd.toFixed(2)}h vs derived ${totalDerivedNd.toFixed(2)}h\n`)
}

await prisma.$disconnect()
