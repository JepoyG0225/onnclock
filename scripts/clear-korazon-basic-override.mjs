/**
 * Remove ONLY the pinned `basicSalary` key from manualEdits on Korazon's
 * latest payroll run, so the engine's schedule-derived basic pay applies.
 *
 * Every other override (SSS / PhilHealth / Pag-IBIG / withholding / late /
 * undertime / otherEarnings ...) is preserved — the compute route merges
 * with `manual.<field> ?? computed`, so dropping just this key lets the
 * fresh basic through and leaves the rest pinned.
 *
 * Prints a JSON backup of the prior manualEdits to stdout before writing.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const RUN_ID = 'cms8vqnfi0001n68333vq82s6'

const payslips = await prisma.payslip.findMany({
  where: { payrollRunId: RUN_ID },
  select: {
    id: true,
    manualEdits: true,
    employee: { select: { firstName: true, lastName: true } },
  },
})

console.log('=== BACKUP (prior manualEdits) ===')
console.log(JSON.stringify(
  payslips.map(p => ({
    payslipId: p.id,
    name: `${p.employee.lastName}, ${p.employee.firstName}`,
    manualEdits: p.manualEdits,
  })),
  null, 2,
))
console.log('=== END BACKUP ===\n')

let changed = 0
for (const p of payslips) {
  if (!p.manualEdits || typeof p.manualEdits !== 'object') continue
  const edits = { ...p.manualEdits }
  if (!('basicSalary' in edits)) {
    console.log(`- ${p.employee.lastName}: no basicSalary override, skipped`)
    continue
  }
  const removed = edits.basicSalary
  delete edits.basicSalary
  await prisma.payslip.update({
    where: { id: p.id },
    data: { manualEdits: edits },
  })
  changed++
  console.log(
    `✓ ${p.employee.lastName}: removed basicSalary=${removed}, ` +
    `${Object.keys(edits).length} override(s) kept`,
  )
}

console.log(`\nUpdated ${changed} payslip(s).`)
await prisma.$disconnect()
