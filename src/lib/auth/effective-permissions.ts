import { prisma } from '@/lib/prisma'
import { Permission, ROLE_PERMISSIONS, UserRole } from './permissions'

/**
 * Compute the effective Permission[] for a user in a given company.
 *
 * Resolution order:
 *   1. SUPER_ADMIN → every Permission (bypass).
 *   2. COMPANY_ADMIN → DB override if present, else the hardcoded default.
 *      Additionally, COMPANY_ADMIN ALWAYS retains `users:manage` and
 *      `settings:write` so they cannot accidentally lock themselves out of
 *      the role-permissions matrix.
 *   3. Other built-in roles (HR_MANAGER, PAYROLL_OFFICER, EMPLOYEE) →
 *      DB override if present, else the hardcoded default in ROLE_PERMISSIONS.
 *
 * The function is intentionally tolerant of legacy / unknown roles (e.g.
 * DEPARTMENT_HEAD): unknown roles fall through to an empty permission set
 * (callers should layer their own role-based gates on top).
 */
export async function getEffectivePermissions(
  role: string,
  companyId: string | null,
): Promise<Permission[]> {
  // SUPER_ADMIN bypass — they can navigate anywhere.
  if (role === 'SUPER_ADMIN') {
    return [...ROLE_PERMISSIONS.SUPER_ADMIN]
  }

  // Unknown role with no companyId → no permissions.
  if (!companyId) return []

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
