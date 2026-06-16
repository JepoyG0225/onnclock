import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Check if column already exists
  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'income_types' AND column_name = 'excludeFrom2316'
  `
  if (cols.length > 0) {
    console.log('Column excludeFrom2316 already exists — skipping.')
    return
  }

  console.log('Adding excludeFrom2316 column to income_types...')
  await prisma.$executeRaw`
    ALTER TABLE "income_types"
    ADD COLUMN "excludeFrom2316" BOOLEAN NOT NULL DEFAULT false
  `
  console.log('Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
