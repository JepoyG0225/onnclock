/**
 * Audit night-differential calculations on Corex's latest payroll run.
 * Cross-checks each employee's stored nightDiffAmount + nightDiffHours
 * against:
 *   1. Sum of (DTR.nightDiffHours × hourlyRate × ndRate)
 *   2. Recomputed ND from the raw clock-in/out using the PHT 22:00–06:00
 *      window with the company's "include break in ND" setting.
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const RUN_ID = 'cmp5xou1a0001bla0gocbg6x2'
const COMPANY_ID = 'cmnrr36ih0002z07gw1hq6kjj'

const run = await p.payrollRun.findUnique({
  where: { id: RUN_ID },
  include: { company: true },
})
const cycle = await p.payrollCycleConfig.findUnique({ where: { companyId: COMPANY_ID } })
console.log('Company:', run.company.name)
console.log('Period:', run.periodStart.toISOString().slice(0,10), '→', run.periodEnd.toISOString().slice(0,10))
console.log('Pay frequency:', run.payFrequency)
console.log('ND enabled:', cycle?.enableNightDifferential)
console.log('ND start/end (PHT):', cycle?.nightDifferentialStart, '–', cycle?.nightDifferentialEnd)
console.log('ND rate:', cycle?.nightDifferentialRate?.toString())
console.log('ND includes break:', cycle?.nightDifferentialIncludesBreak)
console.log()

const payslips = await p.payslip.findMany({
  where: { payrollRunId: RUN_ID },
  include: {
    employee: {
      select: {
        id: true, firstName: true, lastName: true, employeeNo: true,
        rateType: true, basicSalary: true, dailyRate: true, hourlyRate: true,
        workSchedule: { select: { workHoursPerDay: true } },
      },
    },
  },
})

// PHT minutes for a UTC Date
function phtMinutes(d) {
  if (!d) return null
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60
  return (utcMin + 8 * 60) % (24 * 60)
}
function parseHM(s) {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

const ndStart = parseHM(cycle.nightDifferentialStart || '22:00')
const ndEnd   = parseHM(cycle.nightDifferentialEnd   || '06:00')
const ndRate  = Number(cycle.nightDifferentialRate ?? 0.10)
const includeBreak = !!cycle.nightDifferentialIncludesBreak

// Returns minutes of overlap with the ND window (handles overnight wraparound)
function ndOverlapMins(timeIn, timeOut) {
  if (!timeIn || !timeOut) return 0
  const inMin = phtMinutes(timeIn)
  const outMin = phtMinutes(timeOut)
  // total minutes worked accounting for overnight
  const span = outMin >= inMin ? outMin - inMin : (outMin + 24 * 60 - inMin)
  let total = 0
  for (let cursor = 0; cursor < span; cursor++) {
    const tod = (inMin + cursor) % (24 * 60)
    // ND window: 22:00 (1320) → 06:00 (360) — wraps midnight
    const inWindow = ndStart < ndEnd
      ? (tod >= ndStart && tod < ndEnd)
      : (tod >= ndStart || tod < ndEnd)
    if (inWindow) total++
  }
  return total
}

console.log('Employee | rateType | hourlyRate | ND hours | stored amt | expected amt | diff')
console.log('-'.repeat(110))
let totalDiff = 0

for (const ps of payslips) {
  const e = ps.employee
  const monthly = Number(e.basicSalary)
  const dailyRate = e.dailyRate ? Number(e.dailyRate) : monthly / 22
  const workHours = Number(e.workSchedule?.workHoursPerDay ?? 8)
  const hourlyRate = e.hourlyRate ? Number(e.hourlyRate) : dailyRate / workHours

  const dtrs = await p.dTRRecord.findMany({
    where: { employeeId: e.id, date: { gte: run.periodStart, lte: run.periodEnd } },
    orderBy: { date: 'asc' },
  })

  // Recompute ND minutes from raw clock-in/out
  let recomputedNdMins = 0
  for (const d of dtrs) {
    if (!d.timeIn || !d.timeOut) continue
    let mins = ndOverlapMins(d.timeIn, d.timeOut)
    // Subtract break if it falls inside the ND window AND not includeBreak
    if (!includeBreak && d.breakIn && d.breakOut) {
      const brkInND = ndOverlapMins(d.breakIn, d.breakOut)
      mins = Math.max(0, mins - brkInND)
    }
    recomputedNdMins += mins
  }
  const recomputedNdHours = recomputedNdMins / 60

  const storedNdHours  = Number(ps.nightDiffHours ?? 0)
  const storedNdAmount = Number(ps.nightDiffAmount ?? 0)
  const expectedAmount = parseFloat((hourlyRate * recomputedNdHours * ndRate).toFixed(2))
  const diff = parseFloat((expectedAmount - storedNdAmount).toFixed(2))
  totalDiff += Math.abs(diff)

  console.log(
    `${e.lastName.padEnd(15)} | ${e.rateType.padEnd(8)} | ${hourlyRate.toFixed(2).padStart(7)} | ` +
    `stored ${storedNdHours.toFixed(2).padStart(6)}h vs recomp ${recomputedNdHours.toFixed(2).padStart(6)}h | ` +
    `${storedNdAmount.toFixed(2).padStart(8)} | ${expectedAmount.toFixed(2).padStart(8)} | ${diff > 0 ? '+' : ''}${diff.toFixed(2)}`
  )
}

console.log('-'.repeat(110))
console.log(`Total absolute diff: ₱${totalDiff.toFixed(2)}`)

await p.$disconnect()
