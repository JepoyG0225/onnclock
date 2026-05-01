import { prisma } from '@/lib/prisma'
import type { Permission, UserRole } from '@/lib/auth/permissions'

type AssignableBaseRole = 'COMPANY_ADMIN' | 'HR_MANAGER' | 'PAYROLL_OFFICER'

export type CustomRoleRecord = {
  id: string
  companyId: string
  name: string
  baseRole: AssignableBaseRole
  permissions: Permission[]
}

const BASE_ROLE_FALLBACK: AssignableBaseRole = 'HR_MANAGER'

export async function ensureCustomRoleTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "company_custom_roles" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "baseRole" TEXT NOT NULL,
      "permissions" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId", "name")
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "user_custom_roles" (
      "companyId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "customRoleId" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("companyId", "userId")
    )
  `)
}

function normalizeBaseRole(value: string): AssignableBaseRole {
  if (value === 'COMPANY_ADMIN' || value === 'HR_MANAGER' || value === 'PAYROLL_OFFICER') {
    return value
  }
  return BASE_ROLE_FALLBACK
}

export async function listCompanyCustomRoles(companyId: string): Promise<CustomRoleRecord[]> {
  await ensureCustomRoleTables()
  const rows = await prisma.$queryRaw<Array<{
    id: string
    companyId: string
    name: string
    baseRole: string
    permissions: Permission[] | null
  }>>`
    SELECT "id", "companyId", "name", "baseRole", "permissions"
    FROM "company_custom_roles"
    WHERE "companyId" = ${companyId}
    ORDER BY "name" ASC
  `
  return rows.map(row => ({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    baseRole: normalizeBaseRole(row.baseRole),
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
  }))
}

export async function getCustomRoleById(companyId: string, roleId: string): Promise<CustomRoleRecord | null> {
  await ensureCustomRoleTables()
  const rows = await prisma.$queryRaw<Array<{
    id: string
    companyId: string
    name: string
    baseRole: string
    permissions: Permission[] | null
  }>>`
    SELECT "id", "companyId", "name", "baseRole", "permissions"
    FROM "company_custom_roles"
    WHERE "companyId" = ${companyId} AND "id" = ${roleId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    baseRole: normalizeBaseRole(row.baseRole),
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
  }
}
