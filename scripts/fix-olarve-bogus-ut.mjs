/**
 * One-off cleanup for OLARVE, EZEKIEL (Loyola K-12 Tutorial Services).
 *
 * The Apr 27 and Apr 28, 2026 DTRs were marked with 180 minutes of
 * undertime each because the assigned shift was "PM Shift" (12:00–21:00)
 * but Olarve actually clocked in 09:00–18:00. He worked the same
 * scheduled 8 paid hours — just shifted three hours earlier — so the
 * 360 minutes of "undertime" don't represent any real shortfall and
 * shouldn't deduct ₱493.50 from his pay.
 *
 * Clean both rows' undertimeMinutes back to 0 so the next recompute
 * drops the deduction. Leaves regularHours / nightDiffHours alone
 * because the engine recomputes those from timestamps at payroll time.
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
if (!emp) { console.log('Olarve not found'); process.exit(0) }

const targets = ['2026-04-27', '2026-04-28']
console.log(`Clearing bogus UT for ${emp.lastName}, ${emp.firstName} on ${targets.join(', ')}`)
for (const isoDate of targets) {
  const updated = await prisma.dTRRecord.updateMany({
    where: { employeeId: emp.id, date: new Date(`${isoDate}T00:00:00.000Z`) },
    data: { undertimeMinutes: 0 },
  })
  console.log(`  ${isoDate}: ${updated.count} row(s) updated`)
}
await prisma.$disconnect()
