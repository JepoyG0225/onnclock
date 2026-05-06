import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Checking ALL indexes on employee_shift_assignments...')

  const indexes = await prisma.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'employee_shift_assignments'
    ORDER BY indexname
  `
  console.log('All indexes:', JSON.stringify(indexes, null, 2))

  // Find unique indexes (not the primary key) that cover (employeeId, date)
  for (const idx of indexes) {
    const def = idx.indexdef ?? ''
    const name = idx.indexname ?? ''
    const isPk = name.endsWith('_pkey')
    if (!isPk && def.toLowerCase().includes('unique') && def.includes('date')) {
      console.log(`Dropping unique index: ${name}`)
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${name}"`)
      console.log('  Dropped.')
    }
  }

  // Verify
  const after = await prisma.$queryRaw`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'employee_shift_assignments'
  `
  console.log('\nIndexes after cleanup:', JSON.stringify(after, null, 2))
  console.log('\nDone! Multiple shifts per day now fully supported.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
