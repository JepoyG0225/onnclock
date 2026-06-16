/**
 * Josea Carmel Lazarte is faculty at Loyola K-12. Her two shift assignments
 * for the week of May 4-10 2026 were left at the default 09:00-17:00 even
 * though her actual class times are afternoon-only. That generic shift made
 * her get tagged 4h56m / 2h45m late.
 *
 * Patch the two specific shifts to match the time blocks she actually
 * worked, then recompute the DTRs so lateMinutes drops to 0.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FIXES = [
  { date: '2026-05-06', timeIn: '14:00', timeOut: '18:00' }, // Wed class block (clocked 13:56-18:05)
  { date: '2026-05-08', timeIn: '12:00', timeOut: '17:00' }, // Fri class block (clocked 11:45-17:00)
]

const employee = await prisma.employee.findFirst({
  where: { employeeNo: 'QLP-20250038' },
  select: { id: true, companyId: true, firstName: true, lastName: true },
})
if (!employee) { console.error('Employee not found'); process.exit(1) }
console.log('Employee:', employee.firstName, employee.lastName)

for (const fix of FIXES) {
  const date = new Date(fix.date + 'T00:00:00.000Z')

  // Update or insert the per-day shift assignment
  const existing = await prisma.employeeShiftAssignment.findFirst({
    where: { employeeId: employee.id, date },
  })
  if (existing) {
    await prisma.employeeShiftAssignment.update({
      where: { id: existing.id },
      data: { timeIn: fix.timeIn, timeOut: fix.timeOut, isRestDay: false },
    })
    console.log(`  ✓ updated shift ${fix.date} → ${fix.timeIn}-${fix.timeOut}`)
  } else {
    await prisma.employeeShiftAssignment.create({
      data: {
        companyId:  employee.companyId,
        employeeId: employee.id,
        date,
        timeIn:  fix.timeIn,
        timeOut: fix.timeOut,
        isRestDay: false,
      },
    })
    console.log(`  ✓ created shift ${fix.date} → ${fix.timeIn}-${fix.timeOut}`)
  }

  // Recompute the DTR for that date so lateMinutes reflects the new shift
  const dtr = await prisma.dTRRecord.findFirst({
    where: { employeeId: employee.id, date },
  })
  if (!dtr || !dtr.timeIn || !dtr.timeOut) {
    console.log(`    (no clocked DTR on ${fix.date}, skipping recompute)`)
    continue
  }

  // PHT minutes from the clock-in/out
  const pht = (d) => {
    const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes()
    return (utcMin + 8 * 60) % (24 * 60)
  }
  const parseHM = (s) => {
    const [h, m] = s.split(':').map(Number)
    return h * 60 + m
  }

  const inMin    = pht(dtr.timeIn)
  const outMin   = pht(dtr.timeOut)
  const schedIn  = parseHM(fix.timeIn)
  const schedOut = parseHM(fix.timeOut)

  const lateMinutes      = Math.max(0, inMin - schedIn)
  const undertimeMinutes = Math.max(0, schedOut - outMin)

  // Total raw minutes worked (no break for these short class blocks)
  const totalMinutes = (outMin >= inMin ? outMin - inMin : outMin + 24 * 60 - inMin)
  const regHours     = Math.min(8, totalMinutes / 60)

  // DTRRecord doesn't store scheduledTimeIn/Out — the timesheet UI derives
  // them by joining EmployeeShiftAssignment at render time, which is already
  // updated above. So we only need to refresh the late/undertime/regHours.
  await prisma.dTRRecord.update({
    where: { id: dtr.id },
    data: {
      lateMinutes,
      undertimeMinutes,
      regularHours: parseFloat(regHours.toFixed(2)),
    },
  })
  console.log(`    ✓ recomputed DTR: late=${lateMinutes}m, ut=${undertimeMinutes}m, reg=${regHours.toFixed(2)}h`)
}

await prisma.$disconnect()
console.log('\n✅ Done')
