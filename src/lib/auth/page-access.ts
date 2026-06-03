import { Permission } from './permissions'

/**
 * URL prefix → required permission(s).
 *
 * Used by both the sidebar (to hide disallowed links) and the dashboard
 * layout (to redirect direct-URL navigation when the user lacks access).
 *
 * Semantics:
 *   • The MOST SPECIFIC matching prefix wins (we sort by length desc).
 *   • A path is allowed if the user holds AT LEAST ONE of the listed
 *     permissions (OR semantics). An empty array means "always allow".
 *   • Paths not listed here are allowed by default — only routes that
 *     appear in PAGE_PERMISSIONS / NAV_ITEMS should be gated.
 *
 * Always-allow paths (kept off the table on purpose):
 *   • /dashboard              — landing page, every logged-in user needs it
 *   • /settings/profile        — every user should be able to edit themselves
 *   • /settings/billing        — Pro plan upgrade flow, gated separately
 *   • /admin/...               — SUPER_ADMIN only, gated by role elsewhere
 *   • /api/...                 — middleware doesn't touch APIs
 */
export const PATH_REQUIRED_PERMISSIONS: Array<{
  prefix: string
  required: Permission[]
}> = [
  // ── Employment ──────────────────────────────────────────────────────
  { prefix: '/employees',           required: ['employees:read'] },
  { prefix: '/departments',         required: ['departments:write', 'employees:read'] },
  { prefix: '/positions',           required: ['departments:write', 'employees:read'] },
  { prefix: '/org-chart',           required: ['employees:read'] },
  { prefix: '/recruitment',         required: ['employees:write'] },
  { prefix: '/onboarding',          required: ['employees:write'] },
  { prefix: '/performance-reviews', required: ['employees:read'] },
  { prefix: '/offboarding',         required: ['employees:write'] },
  { prefix: '/disciplinary',        required: ['employees:read'] },
  { prefix: '/assets',              required: ['employees:read'] },

  // ── Time & Attendance ───────────────────────────────────────────────
  { prefix: '/dtr',                 required: ['dtr:read'] },
  { prefix: '/attendance/map',      required: ['dtr:read'] },
  { prefix: '/attendance/tardiness',required: ['dtr:read'] },
  { prefix: '/attendance/settings', required: ['settings:read'] },
  { prefix: '/time-corrections',    required: ['dtr:read'] },
  { prefix: '/biometric-devices',   required: ['settings:read'] },
  { prefix: '/schedules',           required: ['settings:read', 'dtr:read'] },
  { prefix: '/holidays',            required: ['settings:read'] },

  // ── Leave Management ────────────────────────────────────────────────
  { prefix: '/leaves/types',        required: ['settings:write'] },
  { prefix: '/leaves/calendar',     required: ['leaves:read'] },
  { prefix: '/leaves',              required: ['leaves:read'] },

  // ── Payroll ─────────────────────────────────────────────────────────
  { prefix: '/payroll/settings',    required: ['settings:write', 'payroll:write'] },
  { prefix: '/payroll',             required: ['payroll:read'] },
  { prefix: '/thirteenth-month',    required: ['payroll:read'] },
  { prefix: '/loans',               required: ['loans:read'] },
  { prefix: '/cash-advance',        required: ['loans:read'] },
  { prefix: '/final-pay',           required: ['payroll:read'] },
  { prefix: '/disbursement',        required: ['payroll:read'] },

  // ── Misc ────────────────────────────────────────────────────────────
  { prefix: '/budget-requisitions', required: ['payroll:read', 'employees:read'] },
  { prefix: '/announcements',       required: ['employees:read'] },

  // ── Reports ─────────────────────────────────────────────────────────
  { prefix: '/reports',             required: ['reports:generate'] },

  // ── Settings & Admin ────────────────────────────────────────────────
  // /settings/profile is always allowed; the other settings sub-paths
  // need the corresponding permission. We list the open one with empty
  // required so the prefix sort still matches it.
  { prefix: '/settings/profile',     required: [] },
  { prefix: '/settings/billing',     required: [] },
  { prefix: '/settings/users',       required: ['users:manage'] },
  { prefix: '/settings/permissions', required: ['users:manage'] },
  { prefix: '/settings/approvals',   required: ['settings:write'] },
  { prefix: '/settings/audit',       required: ['settings:read'] },
  { prefix: '/settings/payroll-rules', required: ['settings:write'] },
  { prefix: '/settings',             required: ['settings:read'] },

  // ── Analytics ───────────────────────────────────────────────────────
  { prefix: '/analytics',           required: ['reports:generate', 'employees:read'] },
]

// Pre-sort by prefix length (descending) so longer/more-specific prefixes
// match first — e.g. /payroll/settings wins over /payroll.
const SORTED = [...PATH_REQUIRED_PERMISSIONS].sort(
  (a, b) => b.prefix.length - a.prefix.length,
)

/**
 * Return the Permission[] required to access `pathname`. Empty array means
 * "no special permission required" (always allowed).
 */
export function getRequiredPermissionsForPath(pathname: string): Permission[] {
  // Strip query string just in case.
  const path = pathname.split('?')[0]
  for (const entry of SORTED) {
    if (path === entry.prefix || path.startsWith(entry.prefix + '/')) {
      return entry.required
    }
  }
  return []
}

/**
 * True iff the user (holding `userPermissions`) is allowed to access
 * `pathname`. Returns true for unlisted paths, /dashboard, /admin/*, etc.
 */
export function canAccessPath(pathname: string, userPermissions: Permission[]): boolean {
  // Always-allow paths that aren't part of the matrix.
  if (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api')
  ) {
    return true
  }
  const required = getRequiredPermissionsForPath(pathname)
  if (!required.length) return true
  return required.some(p => userPermissions.includes(p))
}
