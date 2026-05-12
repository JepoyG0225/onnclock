/**
 * Recompute regularHours / overtimeHours / nightDiffHours / lateMinutes /
 * undertimeMinutes for existing DTR records using the new "regular = planned
 * shift duration" rule. Mirrors the math in
 *   src/app/api/attendance/clock-out/route.ts
 *   src/app/api/dtr/[id]/route.ts
 *
 * Usage:
 *   node scripts/recompute-dtr-hours.mjs --company "NextStep VA" --days 14         # dry-run
 *   node scripts/recompute-dtr-hours.mjs --company "NextStep VA" --days 14 --apply # write
 *   node scripts/recompute-dtr-hours.mjs --dtr <dtrId> --apply                     # single record
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => {
    if (!a.startsWith('--')) return null
    const key = a.slice(2)
    const next = arr[i + 1]
    if (next && !next.startsWith('--')) return [key, next]
    return [key, true]
  }).filter(Boolean),
)
const APPLY = !!args.apply
const COMPANY = args.company || null
const DAYS = parseInt(args.days || '14', 10)
const DTR_ID = args.dtr || null

// ───────────────────────── helpers (mirror route.ts) ─────────────────────────
function diffMinutes(a, b) { return Math.round((a - b) / 60000) }
function getManilaHour(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  return Number(parts.find(p => p.type === 'hour')?.value ?? '0')
}
function getManilaMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  return h * 60 + m
}
function parseTimeToMins(v) {
  if (!v) return null
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(v).trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}
function plannedShiftMinutes(timeInStr, timeOutStr) {
  const a = parseTimeToMins(timeInStr)
  const b = parseTimeToMins(timeOutStr)
  if (a == null || b == null) return null
  let span = b - a
  if (span <= 0) span += 24 * 60
  return span
}

function isInNd(date, startMins, endMins) {
  if (startMins === endMins) return false
  const phtMins = getManilaMinutes(date)
  if (startMins > endMins) return phtMins >= startMins || phtMins < endMins
  return phtMins >= startMins && phtMins < endMins
}

function recompute(timeIn, timeOut, breakIn, breakOut, schedTimeIn, schedTimeOut, allowedBreakMinutes = 60, ndStartMins = 22 * 60, ndEndMins = 6 * 60) {
  const MAX = 24 * 60
  const totalMins = Math.min(diffMinutes(timeOut, timeIn), MAX)
  const effectiveOut = new Date(timeIn.getTime() + totalMins * 60_000)
  const actualBreakMins = breakIn && breakOut
    ? Math.max(0, diffMinutes(
        breakOut > effectiveOut ? effectiveOut : breakOut,
        breakIn < timeIn ? timeIn : breakIn,
      ))
    : 0
  const breakLateMinutes = Math.max(0, actualBreakMins - allowedBreakMinutes)
  const effectiveBreakMins = Math.min(actualBreakMins, allowedBreakMinutes)
  const worked = Math.max(0, totalMins - effectiveBreakMins)

  const planned = plannedShiftMinutes(schedTimeIn, schedTimeOut) ?? 8 * 60
  const regularCap = Math.max(1, Math.min(planned, MAX))
  const regularHours = Math.round(Math.min(worked, regularCap) / 60 * 100) / 100
  const overtimeHours = Math.round(Math.max(0, worked - regularCap) / 60 * 100) / 100

  // ND walk — counts only minutes in [timeIn, timeOut), in the configured ND
  // window, and NOT in the break window. This automatically deducts late /
  // undertime / break (allowed + overbreak) from ND when they fall inside
  // the ND window — matches the live computeHours() exactly.
  let ndMins = 0
  let cursor = new Date(timeIn)
  while (cursor < effectiveOut) {
    if (breakIn && breakOut && cursor >= breakIn && cursor < breakOut) {
      cursor = new Date(cursor.getTime() + 60_000); continue
    }
    if (isInNd(cursor, ndStartMins, ndEndMins)) ndMins++
    cursor = new Date(cursor.getTime() + 60_000)
  }
  ndMins = Math.min(ndMins, worked)  // safety cap — never exceed worked
  const nightDiffHours = Math.round(ndMins / 60 * 100) / 100

  const schedIn = parseTimeToMins(schedTimeIn)
  const schedOut = parseTimeToMins(schedTimeOut)
  const isOvernight = schedIn != null && schedOut != null && schedOut <= schedIn
  const actualInMins = getManilaMinutes(timeIn)
  const actualOutMins = getManilaMinutes(timeOut)
  let normalizedIn = actualInMins
  if (isOvernight && actualInMins < (schedIn ?? 0) && actualInMins < 12 * 60) normalizedIn = actualInMins + 24 * 60
  const clockInLate = schedIn != null ? Math.max(0, normalizedIn - schedIn) : 0
  const lateMinutes = clockInLate + breakLateMinutes
  let undertimeMinutes = 0
  if (schedOut != null) {
    if (isOvernight) { if (actualOutMins < 12 * 60) undertimeMinutes = Math.max(0, schedOut - actualOutMins) }
    else { undertimeMinutes = Math.max(0, schedOut - actualOutMins) }
  }
  return { regularHours, overtimeHours, nightDiffHours, lateMinutes, undertimeMinutes }
}

// ───────────────────────── data fetch ─────────────────────────
let where = { timeIn: { not: null }, timeOut: { not: null } }
// ND window per company — falls back to 22:00-06:00 when not configured.
// (Mirrors src/lib/timesheet/compute.ts → getCompanyNightDiffWindow.)
let ndStartMins = 22 * 60
let ndEndMins = 6 * 60
async function loadNdWindow(companyId) {
  try {
    const cfg = await prisma.payrollCycleConfig.findUnique({
      where: { companyId },
      select: { nightDifferentialStart: true, nightDifferentialEnd: true },
    })
    if (!cfg) return
    const s = parseTimeToMins(cfg.nightDifferentialStart)
    const e = parseTimeToMins(cfg.nightDifferentialEnd)
    if (s != null) ndStartMins = s
    if (e != null) ndEndMins = e
  } catch { /* table missing — keep defaults */ }
}

if (DTR_ID) {
  where = { id: DTR_ID }
  // Look up the DTR's company so we honor its ND window.
  const dtr = await prisma.dTRRecord.findUnique({
    where: { id: DTR_ID },
    select: { employee: { select: { companyId: true } } },
  })
  if (dtr?.employee?.companyId) await loadNdWindow(dtr.employee.companyId)
} else if (COMPANY) {
  const company = await prisma.company.findFirst({
    where: { name: { contains: COMPANY, mode: 'insensitive' } },
    select: { id: true, name: true },
  })
  if (!company) { console.error(`Company "${COMPANY}" not found`); process.exit(1) }
  console.log(`Company: ${company.name} (${company.id})`)
  await loadNdWindow(company.id)
  console.log(`ND window: ${String(Math.floor(ndStartMins / 60)).padStart(2,'0')}:${String(ndStartMins % 60).padStart(2,'0')} → ${String(Math.floor(ndEndMins / 60)).padStart(2,'0')}:${String(ndEndMins % 60).padStart(2,'0')}`)
  const since = new Date(); since.setDate(since.getDate() - DAYS)
  where = {
    employee: { companyId: company.id },
    timeIn: { not: null }, timeOut: { not: null },
    date: { gte: since },
  }
} else {
  console.error('Usage: --company <name> [--days N] OR --dtr <id>  [--apply]')
  process.exit(1)
}

const dtrs = await prisma.dTRRecord.findMany({
  where,
  select: {
    id: true, employeeId: true, date: true,
    timeIn: true, timeOut: true, breakIn: true, breakOut: true,
    regularHours: true, overtimeHours: true, nightDiffHours: true,
    lateMinutes: true, undertimeMinutes: true,
    employee: { select: {
      firstName: true, lastName: true, employeeNo: true,
      workScheduleId: true,
      workSchedule: { select: { timeIn: true, timeOut: true, breakMinutes: true } },
    } },
  },
  orderBy: [{ date: 'desc' }, { timeIn: 'asc' }],
})
console.log(`\nFound ${dtrs.length} closed DTR records to evaluate.\n`)

const changes = []
for (const d of dtrs) {
  // Resolve schedule (assignment override > workSchedule)
  let schedIn = d.employee.workSchedule?.timeIn ?? null
  let schedOut = d.employee.workSchedule?.timeOut ?? null
  let allowedBreak = d.employee.workSchedule?.breakMinutes ?? 60
  // Always check for per-date assignments — they override the fixed template
  // even when the employee has a workScheduleId. (Earlier this was gated on
  // !workScheduleId, which silently bypassed overrides for fixed-schedule
  // employees and produced phantom 9h-late records.)
  {
    const assigns = await prisma.employeeShiftAssignment.findMany({
      where: { employeeId: d.employeeId, date: d.date },
      select: { timeIn: true, timeOut: true, schedule: { select: { timeIn: true, timeOut: true, breakMinutes: true } } },
    })
    if (assigns.length > 0) {
      const actualInPhtMins = getManilaMinutes(d.timeIn)
      let best = null
      let bestDistance = Infinity
      for (const a of assigns) {
        const ti = a.timeIn ?? a.schedule?.timeIn
        const planMins = parseTimeToMins(ti)
        if (planMins == null) continue
        // Circular distance on a 24h clock (so 23:00 vs 01:00 = 2h, not 22h)
        const raw = Math.abs(planMins - actualInPhtMins)
        const dist = Math.min(raw, 24 * 60 - raw)
        if (dist < bestDistance) { bestDistance = dist; best = a }
      }
      const chosen = best ?? assigns[0]
      schedIn = chosen.timeIn ?? chosen.schedule?.timeIn ?? schedIn
      schedOut = chosen.timeOut ?? chosen.schedule?.timeOut ?? schedOut
      if (chosen.schedule?.breakMinutes != null) allowedBreak = chosen.schedule.breakMinutes
    }
  }

  const next = recompute(d.timeIn, d.timeOut, d.breakIn, d.breakOut, schedIn, schedOut, allowedBreak, ndStartMins, ndEndMins)

  const oldReg = Number(d.regularHours ?? 0)
  const oldOT  = Number(d.overtimeHours ?? 0)
  const oldND  = Number(d.nightDiffHours ?? 0)
  const oldLate = Number(d.lateMinutes ?? 0)
  const oldUT  = Number(d.undertimeMinutes ?? 0)

  const drift = Math.abs(next.regularHours - oldReg) + Math.abs(next.overtimeHours - oldOT) +
                Math.abs(next.nightDiffHours - oldND) + Math.abs(next.lateMinutes - oldLate) +
                Math.abs(next.undertimeMinutes - oldUT)
  if (drift < 0.01) continue

  const name = `${d.employee.firstName ?? ''} ${d.employee.lastName ?? ''}`.trim()
  changes.push({ id: d.id, name, date: d.date.toISOString().slice(0,10), schedIn, schedOut,
    old: { reg: oldReg, OT: oldOT, ND: oldND, late: oldLate, UT: oldUT },
    new: next })
}

console.log(`=== Records that would change: ${changes.length} ===\n`)
for (const c of changes) {
  console.log(`${c.name.padEnd(28)} ${c.date}  shift=${c.schedIn ?? '—'}→${c.schedOut ?? '—'}`)
  console.log(`  old:  reg=${c.old.reg}  OT=${c.old.OT}  ND=${c.old.ND}  late=${c.old.late}  UT=${c.old.UT}`)
  console.log(`  NEW:  reg=${c.new.regularHours}  OT=${c.new.overtimeHours}  ND=${c.new.nightDiffHours}  late=${c.new.lateMinutes}  UT=${c.new.undertimeMinutes}`)
  console.log(`  id=${c.id}`)
}

if (!APPLY) {
  console.log(`\n(dry-run — no changes written. Re-run with --apply to commit.)`)
  await prisma.$disconnect(); process.exit(0)
}

console.log(`\nApplying ${changes.length} updates...`)
for (const c of changes) {
  await prisma.dTRRecord.update({
    where: { id: c.id },
    data: {
      regularHours: c.new.regularHours,
      overtimeHours: c.new.overtimeHours,
      nightDiffHours: c.new.nightDiffHours,
      lateMinutes: c.new.lateMinutes,
      undertimeMinutes: c.new.undertimeMinutes,
    },
  })
  process.stdout.write('.')
}
console.log(`\n✓ Applied ${changes.length} updates.`)
await prisma.$disconnect()
