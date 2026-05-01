import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { type Permission, ROLE_PERMISSIONS } from '@/lib/auth/permissions'
import { ensureCustomRoleTables, listCompanyCustomRoles } from '@/lib/custom-roles'

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  baseRole: z.enum(['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER']),
})

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(60).optional(),
  baseRole: z.enum(['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER']).optional(),
  permissions: z.array(z.string()).optional(),
})

export async function GET() {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error
  const roles = await listCompanyCustomRoles(ctx.companyId)
  return NextResponse.json({ roles })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 422 })
  await ensureCustomRoleTables()
  const id = randomUUID()
  const permissions = ROLE_PERMISSIONS[parsed.data.baseRole] as Permission[]
  await prisma.$executeRaw`
    INSERT INTO "company_custom_roles" ("id", "companyId", "name", "baseRole", "permissions", "createdAt", "updatedAt")
    VALUES (${id}, ${ctx.companyId}, ${parsed.data.name}, ${parsed.data.baseRole}, ${permissions as unknown as object}, NOW(), NOW())
  `
  return NextResponse.json({ success: true, id })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 422 })
  await ensureCustomRoleTables()

  const fields: string[] = []
  if (parsed.data.name !== undefined) fields.push(`"name" = '${parsed.data.name.replace(/'/g, "''")}'`)
  if (parsed.data.baseRole !== undefined) fields.push(`"baseRole" = '${parsed.data.baseRole}'`)
  if (parsed.data.permissions !== undefined) {
    const json = JSON.stringify(parsed.data.permissions)
    fields.push(`"permissions" = '${json.replace(/'/g, "''")}'::jsonb`)
  }
  fields.push(`"updatedAt" = NOW()`)
  if (fields.length === 0) return NextResponse.json({ success: true })
  await prisma.$executeRawUnsafe(
    `UPDATE "company_custom_roles" SET ${fields.join(', ')} WHERE "companyId" = $1 AND "id" = $2`,
    ctx.companyId,
    parsed.data.id
  )
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await ensureCustomRoleTables()
  await prisma.$executeRaw`
    DELETE FROM "user_custom_roles"
    WHERE "companyId" = ${ctx.companyId} AND "customRoleId" = ${id}
  `
  await prisma.$executeRaw`
    DELETE FROM "company_custom_roles"
    WHERE "companyId" = ${ctx.companyId} AND "id" = ${id}
  `
  return NextResponse.json({ success: true })
}
