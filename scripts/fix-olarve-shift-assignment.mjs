/**
 * Move OLARVE, EZEKIEL's Apr 27 and Apr 28, 2026 shift assignments from
 * "PM Shift" (12:00–21:00) to "AM Shift" (09:00–18:00) so they match
 * his actual DTR (clocked 09:00–18:00 those days). With the right
 * schedule, the timesheet engine reports 0 UT instead of 180min/day
 * (it was treating his early clock-out as undertime against the PM
 * shift's 21:00 end).
 *
 * Idempotent — uses upsert by (employeeId, date).
 *
 * Followed by:
 *   - recompute DTR hours via the admin endpoint (will pick up the new
 *     schedule and clear the bogus UT)
 *   - recompute Loyola's open payroll run via recompute-loyola-runs.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const company = await prisma.company.findFirst({
  where: { name: { contains: 'loyola', mode: 'insensitive' } },
  select: { id: true, name: true },
})
const emp = await prisma.employee.findFirst({
  where: { companyId: company.id, employeeNo: 'LK12-20250026' },
  select: { id: true, firstName: true, lastName: true },
})
if (!emp) { console.log('OLARVE not found at Loyola'); process.exit(0) }

const amShift = await prisma.workSchedule.findFirst({
  where: { companyId: company.id, name: 'AM Shift', isActive: true },
  select: { id: true, name: true, timeIn: true, timeOut: true },
})
if (!amShift) { console.log('AM Shift not found'); process.exit(0) }
console.log(`Reassigning ${emp.lastName}, ${emp.firstName} → ${amShift.name} (${amShift.timeIn}–${amShift.timeOut})`)

const targets = ['2026-04-27', '2026-04-28']
for (const isoDate of targets) {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  // Find existing assignment for this date so we can update it
  const existing = await prisma.employeeShiftAssignment.findFirst({
    where: { employeeId: emp.id, date },
    select: { id: true, scheduleId: true },
  })
  if (existing) {
    if (existing.scheduleId === amShift.id) {
      console.log(`  ${isoDate}: already on AM Shift — skipping`)
      continue
    }
    await prisma.employeeShiftAssignment.update({
      where: { id: existing.id },
      data: { scheduleId: amShift.id, updatedAt: new Date() },
    })
    console.log(`  ${isoDate}: updated → AM Shift`)
  } else {
    await prisma.employeeShiftAssignment.create({
      data: { employeeId: emp.id, date, scheduleId: amShift.id },
    })
    console.log(`  ${isoDate}: created → AM Shift`)
  }
}
await prisma.$disconnect()
