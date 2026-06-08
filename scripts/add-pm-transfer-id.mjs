/**
 * Adds pm_transfer_id column to payroll_disbursement_items.
 * Stores the per-employee PayMongo batch_transfers ID for the send-money approach.
 *
 * Usage: node scripts/add-pm-transfer-id.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE payroll_disbursement_items
    ADD COLUMN IF NOT EXISTS pm_transfer_id TEXT;
  `)
  console.log('✅  Added pm_transfer_id to payroll_disbursement_items')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
