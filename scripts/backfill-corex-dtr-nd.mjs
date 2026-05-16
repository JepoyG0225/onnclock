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

function countNightMinutes(timeIn, timeOut, startMinutes, endMinutes) {
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
  select: { id: true, timeIn: true, timeOut: true, nightDiffHours: true, date: true },
})
console.log(`Scanning ${dtrs.length} DTR rows…`)

let fixed = 0
let alreadyOk = 0
const samples = []
for (const d of dtrs) {
  const mins = countNightMinutes(d.timeIn, d.timeOut, ND_START_MIN, ND_END_MIN)
  const derived = Math.round((mins / 60) * 100) / 100
  const stored = Number(d.nightDiffHours ?? 0)
  if (Math.abs(stored - derived) <= 0.05) {
    alreadyOk++
    continue
  }
  await prisma.dTRRecord.update({
    where: { id: d.id },
    data: { nightDiffHours: derived },
  })
  fixed++
  if (samples.length < 6) {
    samples.push({
      date: d.date.toISOString().slice(0, 10),
      stored,
      derived,
    })
  }
}

console.log(`\nDone. ${fixed} rows updated, ${alreadyOk} already correct.`)
if (samples.length) {
  console.log('Sample corrections:')
  for (const s of samples) {
    console.log(`  ${s.date}: ${s.stored}h → ${s.derived}h`)
  }
}
await prisma.$disconnect()
