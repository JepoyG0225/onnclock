/**
 * Recompute regular/overtime hours for all Loyola DTR rows after the
 * computeHours cap fix (cap now subtracts unpaid break).
 *
 * Without --apply this is dry-run only.
 *
 * Usage:
 *   node scripts/recompute-loyola-dtr.mjs           # preview
 *   node scripts/recompute-loyola-dtr.mjs --apply   # write
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const MAX_SHIFT_MINUTES = 24 * 60

function parseHHMM(s) {
  if (!s) return null
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(s).trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function plannedShiftMinutes(timeIn, timeOut) {
  const a = parseHHMM(timeIn)
  const b = parseHHMM(timeOut)
  if (a == null || b == null) return null
  let span = b - a
  if (span <= 0) span += 24 * 60
  return span
}

function diffMin(a, b) {
  return Math.max(0, Math.round((a.getTime() - b.getTime()) / 60000))
}

function recompute({ timeIn, timeOut, breakIn, breakOut, scheduleTimeIn, scheduleTimeOut, allowedBreakMinutes }) {
  // Mirror src/lib/timesheet/compute.ts (kept in sync — same rules).
  const effOut = timeOut.getTime() > timeIn.getTime() ? timeOut : new Date(timeOut.getTime() + 24 * 60 * 60 * 1000)
  const total = Math.min(diffMin(effOut, timeIn), MAX_SHIFT_MINUTES)
  const allowedRaw = Math.max(0, Math.min(720, Math.round(allowedBreakMinutes ?? 60)))
  // DOLE: no mandatory break for shifts shorter than 5 hours
  const MIN_SHIFT_FOR_BREAK = 5 * 60
  const allowed = total < MIN_SHIFT_FOR_BREAK ? 0 : allowedRaw

  const actualBreak = (breakIn && breakOut)
    ? Math.max(0, diffMin(
        breakOut > effOut ? effOut : breakOut,
        breakIn < timeIn ? timeIn : breakIn,
      ))
    : allowed
  const effectiveBreak = Math.min(actualBreak, allowed)
  const worked = Math.max(0, total - Math.min(effectiveBreak, total))

  const rawCap = plannedShiftMinutes(scheduleTimeIn, scheduleTimeOut) ?? 8 * 60
  const cap = Math.max(1, Math.min(Math.max(1, rawCap - allowed), MAX_SHIFT_MINUTES))
  const regularMin = Math.min(worked, cap)
  const overtimeMin = Math.max(0, worked - cap)
  return {
    regularHours: Math.round((regularMin / 60) * 100) / 100,
    overtimeHours: Math.round((overtimeMin / 60) * 100) / 100,
  }
}

const c = await prisma.company.findFirst({
  where: { name: { contains: 'loyola', mode: 'insensitive' } },
  select: { id: true, name: true, defaultBreakMinutes: true },
})
if (!c) { console.error('No Loyola company'); process.exit(1) }

// Honour the company's payroll-settings OT toggle. When OT is disabled,
// all computed OT minutes are folded back into regular hours so the DTR
// rows + payslips stay in sync with the policy.
const cfg = await prisma.payrollCycleConfig.findUnique({
  where: { companyId: c.id },
  select: { enableOvertime: true },
})
const overtimeEnabled = cfg?.enableOvertime ?? true

console.log(`\nCompany: ${c.name}  (defaultBreakMinutes=${c.defaultBreakMinutes ?? 60}, overtimeEnabled=${overtimeEnabled})\n`)

// Optional --month=YYYY-MM filter; defaults to "all closed".
const monthArg = process.argv.find(a => a.startsWith('--month='))?.slice('--month='.length)
let dateFilter = {}
if (monthArg) {
  const [yr, mo] = monthArg.split('-').map(Number)
  const start = new Date(Date.UTC(yr, mo - 1, 1))
  const end = new Date(Date.UTC(yr, mo, 1))
  dateFilter = { date: { gte: start, lt: end } }
  console.log(`Restricting to month ${monthArg} (${start.toISOString().slice(0,10)} – ${end.toISOString().slice(0,10)} exclusive)\n`)
}

const rows = await prisma.dTRRecord.findMany({
  where: {
    employee: { companyId: c.id },
    timeIn: { not: null },
    timeOut: { not: null },
    ...dateFilter,
  },
  include: {
    employee: {
      select: {
        id: true, firstName: true, lastName: true, workScheduleId: true,
        workSchedule: { select: { timeIn: true, timeOut: true, breakMinutes: true, breakEnabled: true } },
      },
    },
  },
  orderBy: { date: 'desc' },
})

let changed = 0
const updates = []

for (const r of rows) {
  // Resolve schedule: per-date assignment first, then employee's fixed schedule
  const assignment = await prisma.employeeShiftAssignment.findFirst({
    where: { employeeId: r.employee.id, date: r.date },
    select: {
      timeIn: true, timeOut: true,
      schedule: { select: { timeIn: true, timeOut: true, breakMinutes: true, breakEnabled: true } },
    },
  })
  const schedTimeIn  = assignment?.timeIn  ?? assignment?.schedule?.timeIn  ?? r.employee.workSchedule?.timeIn  ?? null
  const schedTimeOut = assignment?.timeOut ?? assignment?.schedule?.timeOut ?? r.employee.workSchedule?.timeOut ?? null
  // breakEnabled=false → no deduction at all. Otherwise use the configured minutes.
  const breakDisabled =
    assignment?.schedule?.breakEnabled === false ||
    (!assignment?.schedule && r.employee.workSchedule?.breakEnabled === false)
  const allowed = breakDisabled
    ? 0
    : (assignment?.schedule?.breakMinutes ?? r.employee.workSchedule?.breakMinutes ?? c.defaultBreakMinutes ?? 60)

  if (!schedTimeIn || !schedTimeOut) continue // skip if no schedule

  const raw = recompute({
    timeIn: r.timeIn,
    timeOut: r.timeOut,
    breakIn: r.breakIn,
    breakOut: r.breakOut,
    scheduleTimeIn: schedTimeIn,
    scheduleTimeOut: schedTimeOut,
    allowedBreakMinutes: allowed,
  })
  // OT-disabled policy: cap regular at the scheduled paid hours and
  // DROP any excess (don't roll into reg — the company explicitly said
  // they don't pay for hours beyond the scheduled shift).
  const next = overtimeEnabled
    ? raw
    : {
        regularHours: raw.regularHours,  // already capped by computeHours
        overtimeHours: 0,
      }

  const oldReg = Number(r.regularHours ?? 0)
  const oldOt  = Number(r.overtimeHours ?? 0)
  const drift  = Math.abs(oldReg - next.regularHours) > 0.005 || Math.abs(oldOt - next.overtimeHours) > 0.005

  if (drift) {
    changed++
    if (changed <= 20) {
      console.log(`${r.employee.lastName.padEnd(15)} ${r.date.toISOString().slice(0,10)} | reg ${String(oldReg).padStart(5)} → ${String(next.regularHours).padStart(5)} | ot ${String(oldOt).padStart(5)} → ${String(next.overtimeHours).padStart(5)}`)
    }
    updates.push({ id: r.id, reg: next.regularHours, ot: next.overtimeHours })
  }
}

console.log(`\n${changed} / ${rows.length} rows need updates.`)

if (APPLY && updates.length > 0) {
  console.log('\nApplying updates...')
  for (const u of updates) {
    await prisma.dTRRecord.update({
      where: { id: u.id },
      data: { regularHours: u.reg, overtimeHours: u.ot },
    })
  }
  console.log(`Updated ${updates.length} rows.`)
} else if (!APPLY) {
  console.log('\n(Dry run. Re-run with --apply to write changes.)')
}

await prisma.$disconnect()
