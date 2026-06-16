import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
await prisma.$executeRawUnsafe(`
  ALTER TABLE "companies"
    ADD COLUMN IF NOT EXISTS "autoClockoutEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "autoClockoutMinutes" INTEGER NOT NULL DEFAULT 10
`)
console.log('Migration applied')
process.exit(0)
