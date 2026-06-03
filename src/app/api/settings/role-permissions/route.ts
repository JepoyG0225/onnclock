import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { UserRole, ROLE_PERMISSIONS, Permission } from '@/lib/auth/permissions'
import { ensureCustomRoleTables, listCompanyCustomRoles } from '@/lib/custom-roles'

// GET /api/settings/role-permissions
// Returns the effective permissions for every role for this company.
// Company Admin only.
export async function GET() {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const stored = await prisma.companyRolePermission.findMany({
    where: { companyId: ctx.companyId },
  })

  const storedMap = new Map(stored.map(r => [r.role as UserRole, r.permissions as Permission[]]))

  const roles: UserRole[] = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'EMPLOYEE']

  const result: Record<UserRole, Permission[]> = {} as Record<UserRole, Permission[]>
  for (const role of roles) {
    result[role] = storedMap.get(role) ?? ROLE_PERMISSIONS[role]
  }

  const customRoles = await listCompanyCustomRoles(ctx.companyId)
  return NextResponse.json({
    builtIn: result,
    custom: customRoles,
  })
}

// PUT /api/settings/role-permissions
// Body: { role: UserRole, permissions: Permission[] }
// Updates the permissions for a single role for this company.
export async function PUT(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const body = await req.json()
  const { role, permissions } = body as { role: string; permissions: Permission[] }

  if (!role || !Array.isArray(permissions)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // Lockout protection: COMPANY_ADMIN must retain the permissions that
  // unlock the Role Permissions matrix itself. Mirrors the safeguard in
  // getEffectivePermissions() — the loader will re-add them at read time
  // anyway, but rejecting the save here surfaces clearer feedback to the
  // admin instead of silently undoing their toggle on next page load.
  if (role === 'COMPANY_ADMIN') {
    const required: Permission[] = ['users:manage', 'settings:write', 'settings:read']
    const missing = required.filter(p => !permissions.includes(p))
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error:
            `Company Admin cannot have these permissions removed (would lock you out of the matrix): ${missing.join(', ')}`,
        },
        { status: 400 },
      )
    }
  }

  if (role.startsWith('custom:')) {
    const customRoleId = role.replace('custom:', '')
    await ensureCustomRoleTables()
    const permissionsJson = JSON.stringify(permissions)
    await prisma.$executeRawUnsafe(
      `UPDATE "company_custom_roles"
       SET "permissions" = $1::jsonb,
           "updatedAt" = NOW()
       WHERE "companyId" = $2
         AND "id" = $3`,
      permissionsJson,
      ctx.companyId,
      customRoleId
    )
  } else {
    await prisma.companyRolePermission.upsert({
      where:  { companyId_role: { companyId: ctx.companyId, role: role as UserRole } },
      create: { companyId: ctx.companyId, role: role as UserRole, permissions },
      update: { permissions },
    })
  }

  return NextResponse.json({ success: true, role, permissions })
}

// DELETE /api/settings/role-permissions?role=HR_MANAGER
// Resets a role back to its hardcoded defaults by removing the DB override.
export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const role = new URL(req.url).searchParams.get('role')
  if (!role) return NextResponse.json({ error: 'role param required' }, { status: 400 })

  if (role.startsWith('custom:')) {
    const customRoleId = role.replace('custom:', '')
    const customRoles = await listCompanyCustomRoles(ctx.companyId)
    const custom = customRoles.find(r => r.id === customRoleId)
    if (!custom) return NextResponse.json({ error: 'Custom role not found' }, { status: 404 })
    await prisma.$executeRawUnsafe(
      `UPDATE "company_custom_roles"
       SET "permissions" = $1::jsonb,
           "updatedAt" = NOW()
       WHERE "companyId" = $2 AND "id" = $3`,
      JSON.stringify([]),
      ctx.companyId,
      customRoleId
    )
    return NextResponse.json({ success: true, role, permissions: [] })
  } else {
    await prisma.companyRolePermission.deleteMany({
      where: { companyId: ctx.companyId, role: role as UserRole },
    })

    return NextResponse.json({ success: true, role, permissions: ROLE_PERMISSIONS[role as UserRole] })
  }
}
