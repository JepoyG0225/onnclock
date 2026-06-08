/**
 * Sets the disbursementBalance to ₱1,000 for demo/trial companies.
 * Targets companies whose email contains "demo", "test", or "trial",
 * OR whose name contains those keywords.
 *
 * Usage:
 *   node scripts/set-demo-disbursement-balance.mjs
 *
 * To target a specific company by ID:
 *   COMPANY_ID=<id> node scripts/set-demo-disbursement-balance.mjs
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_BALANCE = 1_000   // ₱1,000

async function main() {
  const specificId = process.env.COMPANY_ID

  if (specificId) {
    // Target a single company by ID
    const company = await prisma.company.findUnique({
      where: { id: specificId },
      select: { id: true, name: true, email: true, disbursementBalance: true },
    })
    if (!company) {
      console.error(`❌  Company not found: ${specificId}`)
      process.exit(1)
    }
    await prisma.company.update({
      where: { id: specificId },
      data: { disbursementBalance: DEMO_BALANCE },
    })
    console.log(`✅  Set ₱${DEMO_BALANCE.toLocaleString()} for: ${company.name} (${company.email ?? 'no email'})`)
    return
  }

  // Auto-detect demo companies
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { email: { contains: 'demo',  mode: 'insensitive' } },
        { email: { contains: 'test',  mode: 'insensitive' } },
        { email: { contains: 'trial', mode: 'insensitive' } },
        { name:  { contains: 'demo',  mode: 'insensitive' } },
        { name:  { contains: 'test',  mode: 'insensitive' } },
        { name:  { contains: 'trial', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, email: true, disbursementBalance: true },
  })

  if (companies.length === 0) {
    console.log('ℹ️  No demo/test/trial companies found.')
    console.log('   Pass COMPANY_ID=<id> to target a specific company.')
    return
  }

  console.log(`Found ${companies.length} company/companies to update:\n`)
  for (const c of companies) {
    await prisma.company.update({
      where: { id: c.id },
      data: { disbursementBalance: DEMO_BALANCE },
    })
    console.log(`  ✅  ${c.name} (${c.email ?? 'no email'}) — ₱${DEMO_BALANCE.toLocaleString()}`)
  }
  console.log('\nDone.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
