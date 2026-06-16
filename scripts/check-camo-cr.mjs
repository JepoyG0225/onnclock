import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const USER_ID = 'cmo8jd9s000004crit6kksci2'
const COMPANY_ID = 'cmnogr3ui0002h6wadorokmll'

const row = await prisma.$queryRawUnsafe(
  `SELECT ucr."customRoleId", ccr."name", ccr."baseRole", ccr."permissions"
   FROM "user_custom_roles" ucr
   JOIN "company_custom_roles" ccr ON ccr."id" = ucr."customRoleId"
   WHERE ucr."companyId" = $1 AND ucr."userId" = $2`,
  COMPANY_ID, USER_ID,
)
console.log('Custom-role assignment for Geraldine:', JSON.stringify(row, null, 2))
process.exit(0)
