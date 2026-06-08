import { prisma } from '@/lib/prisma'
import { Permission, ROLE_PERMISSIONS, UserRole } from './permissions'

/**
 * Compute the effective Permission[] for a user in a given company.
 *
 * Resolution order:
 *   1. SUPER_ADMIN → every Permission (bypass).
 *   2. **Custom role assignment** (user_custom_roles) → if the user has been
 *      assigned to a company-defined custom role (e.g. "Operations Lead"),
 *      use that role's stored permissions verbatim. This wins over the
 *      built-in role override because the admin explicitly placed the user
 *      on a custom role to grant them a specific permission set.
 *   3. COMPANY_ADMIN built-in → DB override if present, else default.
 *      Always force-granted users:manage / settings:write / settings:read
 *      to prevent self-lockout from the matrix.
 *   4. Other built-in roles (HR_MANAGER, PAYROLL_OFFICER, EMPLOYEE) →
 *      DB override if present, else the hardcoded default in ROLE_PERMISSIONS.
 *
 * The function is intentionally tolerant of legacy / unknown roles (e.g.
 * DEPARTMENT_HEAD): unknown roles fall through to an empty permission set
 * (callers should layer their own role-based gates on top).
 */
export async function getEffectivePermissions(
  role: string,
  companyId: string | null,
  /**
   * If provided, the loader will first check whether this user is assigned
   * to a company custom role (user_custom_roles table). When present, the
   * custom role's permission set is returned instead of the built-in role
   * override. Omit only when calling this util in a context where no user
   * is involved (e.g. role-permission preview UIs).
   */
  userId?: string | null,
): Promise<Permission[]> {
  // SUPER_ADMIN bypass — they can navigate anywhere.
  if (role === 'SUPER_ADMIN') {
    return [...ROLE_PERMISSIONS.SUPER_ADMIN]
  }

  // Unknown role with no companyId → no permissions.
  if (!companyId) return []

  // ── Custom-role assignment check ────────────────────────────────────
  // If this user is on a company custom role (e.g. "Operations Lead"),
  // honor that assignment over the built-in role override. We use a raw
  // query because user_custom_roles is created via ensureCustomRoleTables
  // and isn't part of the Prisma schema. Silently fall through to the
  // built-in path if anything goes wrong — we'd rather degrade to defaults
  // than lock the user out.
  if (userId) {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ permissions: Permission[] | null }>>(
        `SELECT ccr."permissions"
         FROM "user_custom_roles" ucr
         JOIN "company_custom_roles" ccr ON ccr."id" = ucr."customRoleId"
         WHERE ucr."companyId" = $1 AND ucr."userId" = $2
         LIMIT 1`,
        companyId,
        userId,
      )
      const customPerms = rows[0]?.permissions
      if (Array.isArray(customPerms) && customPerms.length > 0) {
        return [...customPerms]
      }
    } catch {
      // Table missing or query failed → fall through to built-in path.
    }
  }

  const defaults = ROLE_PERMISSIONS[role as UserRole] ?? []

  // Look up per-company override; if missing, use the hardcoded defaults.
  let effective: Permission[]
  try {
    const override = await prisma.companyRolePermission.findUnique({
      where: { companyId_role: { companyId, role: role as UserRole } },
      select: { permissions: true },
    })
    if (override && Array.isArray(override.permissions)) {
      effective = override.permissions as Permission[]
    } else {
      effective = [...defaults]
    }
  } catch {
    // If the lookup fails (e.g. transient DB error), fall back to defaults
    // rather than locking the user out entirely.
    effective = [...defaults]
  }

  // Lockout protection: COMPANY_ADMIN must always retain the two
  // permissions required to manage permissions / users. Otherwise an
  // accidental save in the matrix could wedge the entire company.
  if (role === 'COMPANY_ADMIN') {
    const required: Permission[] = ['users:manage', 'settings:write', 'settings:read']
    for (const p of required) {
      if (!effective.includes(p)) effective.push(p)
    }
  }

  return effective
}

/**
 * Quick check — returns true iff `permissions` includes at least one of
 * `required`. If `required` is empty, access is granted unconditionally.
 */
export function hasAnyPermission(permissions: Permission[], required: Permission[]): boolean {
  if (!required.length) return true
  return required.some(p => permissions.includes(p))
}
