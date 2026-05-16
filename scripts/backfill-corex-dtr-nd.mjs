/**
 * Repair COREX DTRRecord.nightDiffHours values.
 *
 * Background: the older night-diff routine used `cursor.getHours()` which
 * returns UTC hours on Vercel — so any overnight PHT shift produced wrong
 * (sometimes negative) ND minutes that were persisted back to the DTR row.
 * The payroll engine now recomputes ND on every run from raw timestamps,
 * so payslips are correct; but the DTR list view still shows the stale
 * values to HR users.
 *
 * This script:
 *   1. Finds the COREX company.
 *   2. Walks every DTRRecord that has BOTH timeIn and timeOut.
 *   3. Recomputes nightDiffHours using the PHT-aware overlap logic.
 *   4. Updates each row whose stored value disagrees by > 0.05h.
 *
 * Idempotent — safe to re-run. Prints a summary of how many rows it
 * touched and the first few mismatches it corrected so you can spot-check.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const ND_START_MIN = 22 * 60
const ND_END_MIN = 6 * 60

/** Roll timeOut +24h when it landed on the same calendar day as timeIn
 *  (overnight-shift data-entry bug). */
function normalizeOvernightOut(timeIn, timeOut) {
  if (timeOut.getTime() > timeIn.getTime()) return timeOut
  return new Date(timeOut.getTime() + 24 * 60 * 60 * 1000)
}

function countNightMinutes(timeIn, timeOut, startMinutes, endMinutes) {
  let minutes = 0
  const crossesMidnight = startMinutes > endMinutes
  const effOut = normalizeOvernightOut(timeIn, timeOut)
  let cursor = new Date(timeIn)
  while (cursor < effOut) {
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
  console.log('COREX not found.')
  process.exit(0)
}
console.log(`Backfilling DTR ND for ${company.name} (${company.id})`)

const dtrs = await prisma.dTRRecord.findMany({
  where: {
    employee: { companyId: company.id },
    timeIn: { not: null },
    timeOut: { not: null },
  },
  select: {
    id: true, timeIn: true, timeOut: true, date: true,
    regularHours: true, overtimeHours: true, nightDiffHours: true,
    employee: {
      select: { workSchedule: { select: { workHoursPerDay: true, breakMinutes: true } } },
    },
  },
})
console.log(`Scanning ${dtrs.length} DTR rows…`)

let fixed = 0
let alreadyOk = 0
const samples = []
for (const d of dtrs) {
  const ti = d.timeIn
  const to = normalizeOvernightOut(d.timeIn, d.timeOut)
  const totalMin = Math.max(0, (to.getTime() - ti.getTime()) / 60_000)
  const breakMin = Number(d.employee.workSchedule?.breakMinutes ?? 60)
  const workCap = Number(d.employee.workSchedule?.workHoursPerDay ?? 8) * 60
  // Match the engine: subtract break, cap regular at workHoursPerDay, OT
  // is anything beyond that.
  const workedMin = Math.max(0, totalMin - breakMin)
  const regularMin = Math.min(workedMin, workCap)
  const otMin = Math.max(0, workedMin - workCap)
  const ndMin = countNightMinutes(d.timeIn, d.timeOut, ND_START_MIN, ND_END_MIN)

  const derivedReg = Math.round((regularMin / 60) * 100) / 100
  const derivedOt = Math.round((otMin / 60) * 100) / 100
  const derivedNd = Math.round((ndMin / 60) * 100) / 100
  const storedReg = Number(d.regularHours ?? 0)
  const storedOt = Number(d.overtimeHours ?? 0)
  const storedNd = Number(d.nightDiffHours ?? 0)

  const ok =
    Math.abs(storedReg - derivedReg) <= 0.05 &&
    Math.abs(storedOt  - derivedOt)  <= 0.05 &&
    Math.abs(storedNd  - derivedNd)  <= 0.05
  if (ok) { alreadyOk++; continue }

  await prisma.dTRRecord.update({
    where: { id: d.id },
    data: {
      regularHours: derivedReg,
      overtimeHours: derivedOt,
      nightDiffHours: derivedNd,
    },
  })
  fixed++
  if (samples.length < 8) {
    samples.push({
      date: d.date.toISOString().slice(0, 10),
      reg: `${storedReg}→${derivedReg}`,
      ot: `${storedOt}→${derivedOt}`,
      nd: `${storedNd}→${derivedNd}`,
    })
  }
}

console.log(`\nDone. ${fixed} rows updated, ${alreadyOk} already correct.`)
if (samples.length) {
  console.log('Sample corrections (reg / OT / ND):')
  for (const s of samples) {
    console.log(`  ${s.date}: reg ${s.reg}  ot ${s.ot}  nd ${s.nd}`)
  }
}
await prisma.$disconnect()
