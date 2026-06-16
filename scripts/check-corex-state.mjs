import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const c = await prisma.company.findFirst({
  where: { name: { contains: 'corex', mode: 'insensitive' } },
  select: { id: true, name: true },
})

// Try to read the toggle — wrapped because column might not exist
let cfg
try {
  cfg = await prisma.payrollCycleConfig.findUnique({
    where: { companyId: c.id },
    select: { nightDifferentialStart: true, nightDifferentialEnd: true, nightDifferentialIncludesBreak: true, enableNightDifferential: true },
  })
} catch (e) {
  console.log('ERROR reading config — column may be missing:', e.message)
  // Fallback: raw SQL without the new column
  const rows = await prisma.$queryRaw`
    SELECT "nightDifferentialStart", "nightDifferentialEnd", "enableNightDifferential"
    FROM "payroll_cycle_configs" WHERE "companyId" = ${c.id} LIMIT 1
  `
  cfg = rows[0]
  cfg.nightDifferentialIncludesBreak = '(column missing in DB)'
}

console.log(c.name, '\n', JSON.stringify(cfg, null, 2))

// Check column existence directly
const colExists = await prisma.$queryRaw`
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'payroll_cycle_configs'
    AND column_name = 'nightDifferentialIncludesBreak'
`
console.log('\nColumn exists in DB:', colExists.length > 0)

// Sample 3 recent DTRs
const dtrs = await prisma.dTRRecord.findMany({
  where: { employee: { companyId: c.id }, timeIn: { not: null }, timeOut: { not: null } },
  select: {
    date: true, timeIn: true, timeOut: true, breakIn: true, breakOut: true,
    regularHours: true, overtimeHours: true, nightDiffHours: true,
    lateMinutes: true, undertimeMinutes: true,
    employee: { select: { firstName: true, lastName: true } },
  },
  orderBy: { date: 'desc' },
  take: 3,
})
console.log('\nMost recent 3 DTRs:')
for (const d of dtrs) {
  console.log(`  ${d.employee.firstName} ${d.employee.lastName}  ${d.date.toISOString().slice(0,10)}  reg=${d.regularHours} OT=${d.overtimeHours} ND=${d.nightDiffHours} late=${d.lateMinutes}m UT=${d.undertimeMinutes}m`)
}

await prisma.$disconnect()
