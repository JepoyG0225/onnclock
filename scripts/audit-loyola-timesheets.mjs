/**
 * Audit a company's timesheet data for inconsistencies.
 *
 * Surfaces (read-only by default):
 *   - DTRs stuck open (timeIn but no timeOut > 24h ago)
 *   - DTRs with timeOut but no timeIn
 *   - DTRs whose stored hours disagree with what the new
 *     "regular = planned shift duration" math would produce
 *   - Multi-shift days where another DTR exists on the same date
 *   - Suspicious late minutes (>240 = >4h late)
 *   - PENDING auto-OT requests for DTRs that no longer have OT
 *   - DTRs with overtimeHours > 0 but no matching OvertimeRequest row
 *
 * Usage:
 *   node scripts/audit-loyola-timesheets.mjs --company "Loyola"
 *   node scripts/audit-loyola-timesheets.mjs --company "Loyola" --days 30
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
const COMPANY = args.company
const DAYS = parseInt(args.days || '30', 10)

if (!COMPANY) {
  console.error('Usage: --company "Loyola" [--days 30]')
  process.exit(1)
}

// ─── 1. Locate company ───
const candidates = await prisma.company.findMany({
  where: { name: { contains: COMPANY, mode: 'insensitive' } },
  select: { id: true, name: true, _count: { select: { employees: true } } },
})
if (candidates.length === 0) { console.error(`No company matching "${COMPANY}"`); process.exit(1) }
if (candidates.length > 1) {
  console.log('Multiple matches:')
  for (const c of candidates) console.log(`  ${c.id}  ${c.name}  (${c._count.employees} emp)`)
  process.exit(0)
}
const company = candidates[0]
console.log(`\n=== ${company.name}  (${company.id}) ===\n`)

// ─── 2. Fetch employees + DTRs ───
const employees = await prisma.employee.findMany({
  where: { companyId: company.id },
  select: {
    id: true, employeeNo: true, firstName: true, lastName: true,
    isActive: true, workScheduleId: true,
    workSchedule: { select: { timeIn: true, timeOut: true, breakMinutes: true } },
  },
})
const empById = new Map(employees.map(e => [e.id, e]))
const fullName = (e) => e ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() : '?'

const since = new Date(); since.setDate(since.getDate() - DAYS)
const dtrs = await prisma.dTRRecord.findMany({
  where: { employeeId: { in: employees.map(e => e.id) }, date: { gte: since } },
  select: {
    id: true, employeeId: true, date: true,
    timeIn: true, timeOut: true, breakIn: true, breakOut: true,
    regularHours: true, overtimeHours: true, nightDiffHours: true,
    lateMinutes: true, undertimeMinutes: true,
    isAbsent: true, isRestDay: true, isHoliday: true, approvedBy: true, remarks: true,
  },
  orderBy: [{ date: 'desc' }, { timeIn: 'asc' }],
})
console.log(`Pulled ${dtrs.length} DTR records from the last ${DAYS} days.\n`)

// ─── 3. Pull all OT requests for the same range ───
const otRequests = await prisma.overtimeRequest.findMany({
  where: { companyId: company.id, date: { gte: since } },
  select: { id: true, employeeId: true, date: true, hours: true, status: true, reason: true },
})
const AUTO_OT_PREFIX = '[AUTO_OT]'

// ─── 4. Helpers (mirror clock-out math) ───
function diffMinutes(a, b) { return Math.round((a - b) / 60000) }
function getManilaHour(date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return Number(parts.find(p => p.type === 'hour')?.value ?? '0')
}
function getManilaMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return Number(parts.find(p => p.type === 'hour')?.value ?? '0') * 60 + Number(parts.find(p => p.type === 'minute')?.value ?? '0')
}
function parseTimeToMins(v) {
  if (!v) return null
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(v).trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}
function plannedMins(timeInStr, timeOutStr) {
  const a = parseTimeToMins(timeInStr); const b = parseTimeToMins(timeOutStr)
  if (a == null || b == null) return null
  let span = b - a; if (span <= 0) span += 24 * 60
  return span
}
function recomputeReg(timeIn, timeOut, breakIn, breakOut, schedIn, schedOut, allowed = 60) {
  const MAX = 24 * 60
  const totalMins = Math.min(diffMinutes(timeOut, timeIn), MAX)
  const effectiveOut = new Date(timeIn.getTime() + totalMins * 60_000)
  const actualBreak = breakIn && breakOut ? Math.max(0, diffMinutes(
    breakOut > effectiveOut ? effectiveOut : breakOut,
    breakIn < timeIn ? timeIn : breakIn,
  )) : 0
  const effectiveBreak = Math.min(actualBreak, allowed)
  const worked = Math.max(0, totalMins - effectiveBreak)
  const planned = plannedMins(schedIn, schedOut) ?? 480
  const cap = Math.max(1, Math.min(planned, MAX))
  return {
    regularHours: Math.round(Math.min(worked, cap) / 60 * 100) / 100,
    overtimeHours: Math.round(Math.max(0, worked - cap) / 60 * 100) / 100,
  }
}

// ─── 5. Bucket inconsistencies ───
const issues = {
  stuckOpen: [],          // timeIn but no timeOut > 24h ago
  outNoIn: [],            // timeOut but no timeIn (corrupt)
  hoursDrift: [],         // stored vs recomputed mismatch
  bigLate: [],            // lateMinutes > 240
  pendingAutoOtNoOt: [],  // PENDING auto-OT but DTR has no OT
  otNoRequest: [],        // DTR has OT > 0 but no OT request
  nightDiffNoOverlap: [], // ND > 0 but timeIn/Out outside 22-06 window
}
const dtrsByEmpDate = new Map() // empId|YYYY-MM-DD → DTR[]
for (const d of dtrs) {
  const k = `${d.employeeId}|${d.date.toISOString().slice(0,10)}`
  if (!dtrsByEmpDate.has(k)) dtrsByEmpDate.set(k, [])
  dtrsByEmpDate.get(k).push(d)
}

// Stuck open & out-no-in
const oneDayAgo = new Date(Date.now() - 24*60*60*1000)
for (const d of dtrs) {
  if (d.timeIn && !d.timeOut && d.timeIn < oneDayAgo) issues.stuckOpen.push(d)
  if (!d.timeIn && d.timeOut) issues.outNoIn.push(d)
  if ((d.lateMinutes ?? 0) > 240) issues.bigLate.push(d)
}

// Hours drift — recompute and compare
for (const d of dtrs) {
  if (!d.timeIn || !d.timeOut) continue
  const emp = empById.get(d.employeeId)
  let schedIn = emp?.workSchedule?.timeIn ?? null
  let schedOut = emp?.workSchedule?.timeOut ?? null
  let allowedBreak = emp?.workSchedule?.breakMinutes ?? 60
  if (!emp?.workScheduleId) {
    // Closest-match assignment for the date (mirror closest-match recompute)
    const assigns = await prisma.employeeShiftAssignment.findMany({
      where: { employeeId: d.employeeId, date: d.date },
      select: { timeIn: true, timeOut: true, schedule: { select: { timeIn: true, timeOut: true, breakMinutes: true } } },
    })
    if (assigns.length > 0) {
      const actualPht = getManilaMinutes(d.timeIn)
      let best = null; let bestDist = Infinity
      for (const a of assigns) {
        const ti = a.timeIn ?? a.schedule?.timeIn
        const m = parseTimeToMins(ti); if (m == null) continue
        const raw = Math.abs(m - actualPht)
        const dist = Math.min(raw, 24*60 - raw)
        if (dist < bestDist) { bestDist = dist; best = a }
      }
      const chosen = best ?? assigns[0]
      schedIn = chosen.timeIn ?? chosen.schedule?.timeIn ?? schedIn
      schedOut = chosen.timeOut ?? chosen.schedule?.timeOut ?? schedOut
      if (chosen.schedule?.breakMinutes != null) allowedBreak = chosen.schedule.breakMinutes
    }
  }
  const recomputed = recomputeReg(d.timeIn, d.timeOut, d.breakIn, d.breakOut, schedIn, schedOut, allowedBreak)
  const oldReg = Number(d.regularHours ?? 0); const oldOt = Number(d.overtimeHours ?? 0)
  const drift = Math.abs(recomputed.regularHours - oldReg) + Math.abs(recomputed.overtimeHours - oldOt)
  if (drift >= 0.05) {
    issues.hoursDrift.push({ d, schedIn, schedOut, oldReg, oldOt, newReg: recomputed.regularHours, newOt: recomputed.overtimeHours })
  }
}

// PENDING auto-OT for DTRs with no OT
const autoOtByEmpDate = new Map()
for (const o of otRequests) {
  if (!o.reason?.startsWith(AUTO_OT_PREFIX)) continue
  const k = `${o.employeeId}|${o.date.toISOString().slice(0,10)}`
  if (!autoOtByEmpDate.has(k)) autoOtByEmpDate.set(k, [])
  autoOtByEmpDate.get(k).push(o)
}
for (const [k, list] of autoOtByEmpDate) {
  const dtrList = dtrsByEmpDate.get(k) ?? []
  const totalOt = dtrList.reduce((s, d) => s + Number(d.overtimeHours ?? 0), 0)
  if (totalOt < 0.05) {
    for (const o of list) if (o.status === 'PENDING') issues.pendingAutoOtNoOt.push(o)
  }
}

// DTR has OT but no OT request at all
for (const d of dtrs) {
  if (Number(d.overtimeHours ?? 0) <= 0) continue
  const k = `${d.employeeId}|${d.date.toISOString().slice(0,10)}`
  const hasReq = (otRequests.some(o => `${o.employeeId}|${o.date.toISOString().slice(0,10)}` === k))
  if (!hasReq) issues.otNoRequest.push(d)
}

// ND > 0 but timeIn/Out don't intersect 22:00-06:00 PHT
for (const d of dtrs) {
  if (Number(d.nightDiffHours ?? 0) <= 0 || !d.timeIn || !d.timeOut) continue
  // Walk minute-by-minute, count any minute in [22, 06)
  let ndMins = 0
  for (let cur = new Date(d.timeIn); cur < d.timeOut; cur = new Date(cur.getTime() + 60_000)) {
    const h = getManilaHour(cur)
    if (h >= 22 || h < 6) ndMins++
    if (ndMins > 1) break
  }
  if (ndMins === 0) issues.nightDiffNoOverlap.push(d)
}

// ─── 6. Report ───
function fmt(d) { return d.date.toISOString().slice(0,10) }

console.log('═══ Inconsistency Report ═══\n')

console.log(`Stuck-open DTRs (in but no out, >24h):  ${issues.stuckOpen.length}`)
for (const d of issues.stuckOpen.slice(0, 10)) console.log(`  ${fullName(empById.get(d.employeeId)).padEnd(28)} ${fmt(d)}  in=${d.timeIn?.toISOString()}`)

console.log(`\nDTRs with timeOut but no timeIn:        ${issues.outNoIn.length}`)
for (const d of issues.outNoIn.slice(0, 10)) console.log(`  ${fullName(empById.get(d.employeeId)).padEnd(28)} ${fmt(d)}  id=${d.id}`)

console.log(`\nHours-drift (stored vs recomputed):     ${issues.hoursDrift.length}`)
for (const x of issues.hoursDrift.slice(0, 12)) {
  console.log(`  ${fullName(empById.get(x.d.employeeId)).padEnd(28)} ${fmt(x.d)}  shift=${x.schedIn ?? '—'}→${x.schedOut ?? '—'}`)
  console.log(`     old reg=${x.oldReg} OT=${x.oldOt}  →  NEW reg=${x.newReg} OT=${x.newOt}`)
}

console.log(`\nLate minutes >4h (likely shift mismatch): ${issues.bigLate.length}`)
for (const d of issues.bigLate.slice(0, 10)) console.log(`  ${fullName(empById.get(d.employeeId)).padEnd(28)} ${fmt(d)}  late=${d.lateMinutes}m`)

console.log(`\nPENDING auto-OT requests with no OT in DTR: ${issues.pendingAutoOtNoOt.length}`)
for (const o of issues.pendingAutoOtNoOt.slice(0, 10)) console.log(`  ${fullName(empById.get(o.employeeId)).padEnd(28)} ${fmt(o)}  hours=${o.hours}  id=${o.id}`)

console.log(`\nDTRs with OT > 0 but no OvertimeRequest row: ${issues.otNoRequest.length}`)
for (const d of issues.otNoRequest.slice(0, 10)) console.log(`  ${fullName(empById.get(d.employeeId)).padEnd(28)} ${fmt(d)}  OT=${d.overtimeHours}h`)

console.log(`\nNightDiff > 0 but no overlap with 22:00-06:00 PHT: ${issues.nightDiffNoOverlap.length}`)
for (const d of issues.nightDiffNoOverlap.slice(0, 10)) console.log(`  ${fullName(empById.get(d.employeeId)).padEnd(28)} ${fmt(d)}  ND=${d.nightDiffHours}h`)

await prisma.$disconnect()
