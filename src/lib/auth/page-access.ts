import { Permission } from "./permissions";

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
  prefix: string;
  required: Permission[];
}> = [
  // ── Employment ──────────────────────────────────────────────────────
  { prefix: "/employee-journeys", required: ["onboarding:manage", "offboarding:manage"] },
  { prefix: "/employees", required: ["employees:read"] },
  {
    prefix: "/organization",
    required: ["departments:write", "employees:read"],
  },
  // Legacy routes, kept as redirects into the tabs above.
  { prefix: "/departments", required: ["departments:write", "employees:read"] },
  { prefix: "/positions", required: ["departments:write", "employees:read"] },
  { prefix: "/org-chart", required: ["employees:read"] },
  // Recruitment handles hiring; Employee Journeys hosts lifecycle management.
  {
    prefix: "/recruitment",
    required: ["employees:write", "recruitment:manage"],
  },
  { prefix: "/onboarding", required: ["onboarding:manage"] },
  {
    prefix: "/performance",
    required: ["employees:read", "performance:manage"],
  },
  // Legacy routes, kept as redirects into the tabs above.
  {
    prefix: "/performance-reviews",
    required: ["employees:read", "performance:manage"],
  },
  {
    prefix: "/offboarding",
    required: ["offboarding:manage"],
  },
  {
    prefix: "/disciplinary",
    required: ["employees:read", "disciplinary:manage"],
  },
  { prefix: "/assets", required: ["employees:read", "assets:manage"] },

  // ── Time & Attendance ───────────────────────────────────────────────
  // /timesheets is the merged Time Sheets + Corrections + Overtime page. It's
  // gated on dtr:read (the broadest of the three) because the tabs inside
  // still enforce their own approve permissions on the actions themselves.
  { prefix: "/attendance/map", required: ["dtr:read"] },
  { prefix: "/attendance/reports", required: ["dtr:read"] },
  { prefix: "/attendance/tardiness", required: ["dtr:read"] },
  { prefix: "/attendance/settings", required: ["settings:read"] },
  { prefix: "/attendance/reports", required: ["dtr:read"] },
  { prefix: "/attendance/map", required: ["dtr:read"] },
  { prefix: "/employee-files", required: ["employees:read"] },
  { prefix: "/tax-annualization", required: ["payroll:read"] },
  { prefix: "/billing", required: ["users:manage", "billing:manage"] },
  { prefix: "/settings/attendance", required: ["settings:read"] },
  { prefix: "/settings/workflows", required: ["approvals:manage"] },
  { prefix: "/timesheets", required: ["dtr:read"] },
  // Legacy routes, kept as redirects into the tabs above.
  { prefix: "/dtr", required: ["dtr:read"] },
  { prefix: "/time-corrections", required: ["dtr:read"] },
  { prefix: "/overtime-requests", required: ["dtr:read", "overtime:approve"] },
  { prefix: "/biometric-devices", required: ["settings:read"] },
  { prefix: "/schedules", required: ["settings:read", "dtr:read"] },
  { prefix: "/holidays", required: ["settings:read"] },

  // ── Leave Management ────────────────────────────────────────────────
  { prefix: "/leaves/credits", required: ["leaves:read", "payroll:write"] },
  { prefix: "/leaves/encashments", required: ["payroll:read"] },
  { prefix: "/leaves/types", required: ["settings:write"] },
  { prefix: "/leaves/calendar", required: ["leaves:read"] },
  { prefix: "/leaves", required: ["leaves:read"] },

  // ── Payroll ─────────────────────────────────────────────────────────
  {
    prefix: "/payroll/settings",
    required: ["settings:write", "payroll:write"],
  },
  { prefix: "/payroll", required: ["payroll:read"] },
  { prefix: "/thirteenth-month", required: ["payroll:read"] },
  { prefix: "/loans", required: ["loans:read"] },
  { prefix: "/cash-advance", required: ["loans:read", "cashadvance:approve"] },
  { prefix: "/final-pay", required: ["payroll:read"] },
  { prefix: "/integrations", required: ["payroll:read", "settings:write"] },
  { prefix: "/requisitions", required: ["budget:read", "budget:approve", "payroll:read", "employees:read", "expenses:read", "expenses:approve"] },
  { prefix: "/expenses", required: ["expenses:read", "expenses:approve"] },
  { prefix: "/benefits", required: ["benefits:manage", "employees:read"] },
  { prefix: "/learning", required: ["learning:manage", "employees:read"] },

  // ── Misc ────────────────────────────────────────────────────────────
  {
    prefix: "/budget-requisitions",
    required: [
      "payroll:read",
      "employees:read",
      "budget:read",
      "budget:approve",
    ],
  },
  {
    prefix: "/announcements",
    required: ["employees:read", "announcements:write"],
  },

  // ── Task Management ─────────────────────────────────────────────────
  { prefix: "/hr-center", required: ["contracts:manage", "compliance:manage", "documents:manage", "ssscases:manage", "wageorders:manage", "profilechanges:manage", "salarychanges:manage", "salarychanges:approve", "safety:manage"] },
  { prefix: "/hr-requests", required: ["hrrequests:manage"] },
  { prefix: "/tasks", required: ["tasks:read", "tasks:manage"] },

  // ── Reports ─────────────────────────────────────────────────────────
  { prefix: "/reports", required: ["reports:generate"] },

  // ── Settings & Admin ────────────────────────────────────────────────
  // /settings/profile is always allowed; the other settings sub-paths
  // need the corresponding permission. We list the open one with empty
  // required so the prefix sort still matches it.
  //
  // Audit & Compliance and Billing are COMPANY_ADMIN-only by design.
  // Both surface company-wide financial/governance data that lower
  // roles shouldn't see, so we gate them on users:manage (the canonical
  // COMPANY_ADMIN permission, force-granted to that role by the loader
  // so they can never lock themselves out). A custom role can still be
  // granted users:manage explicitly if the admin wants to share access.
  { prefix: "/settings/profile", required: [] },
  { prefix: "/settings/billing", required: ["users:manage", "billing:manage"] },
  { prefix: "/settings/users", required: ["users:manage"] },
  { prefix: "/settings/permissions", required: ["users:manage"] },
  { prefix: "/settings/approvals", required: ["settings:write", "approvals:manage"] },
  { prefix: "/settings/audit", required: ["users:manage", "audit:read"] },
  { prefix: "/settings/payroll-rules", required: ["settings:write"] },
  { prefix: "/settings", required: ["settings:read"] },

  // ── Analytics ───────────────────────────────────────────────────────
  { prefix: "/analytics", required: ["analytics:read", "reports:generate", "employees:read"] },

  // ── Dashboard ───────────────────────────────────────────────────────
  // Dashboard surfaces headcount, payroll status, pending approvals, etc.
  // — all employee-oriented snapshots. A role with no employees:read (e.g.
  // a narrow custom role like "Operations Lead") gets nothing useful from
  // it, so we gate it. When a user lacks dashboard access, the layout
  // redirects them to the first nav path they CAN access (see
  // findFirstAccessiblePath below).
  { prefix: "/dashboard", required: ["employees:read"] },
];

// Pre-sort by prefix length (descending) so longer/more-specific prefixes
// match first — e.g. /payroll/settings wins over /payroll.
const SORTED = [...PATH_REQUIRED_PERMISSIONS].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

/**
 * Return the Permission[] required to access `pathname`. Empty array means
 * "no special permission required" (always allowed).
 */
export function getRequiredPermissionsForPath(pathname: string): Permission[] {
  // Strip query string just in case.
  const path = pathname.split("?")[0];
  if (path === '/employees/new' || /^\/employees\/[^/]+\/edit(?:\/|$)/.test(path)) return ['employees:write'];
  if (path === '/payroll/new') return ['payroll:write'];
  for (const entry of SORTED) {
    if (path === entry.prefix || path.startsWith(entry.prefix + "/")) {
      return entry.required;
    }
  }
  return [];
}

/**
 * True iff the user (holding `userPermissions`) is allowed to access
 * `pathname`. Returns true for unlisted paths, /admin/*, /api/*, etc.
 *
 * /dashboard is NO LONGER unconditionally allowed — it's gated through
 * the table above so narrow custom roles can be tailored to only the
 * pages they're meant to see. Callers that need a safe landing page
 * when /dashboard is denied should use findFirstAccessiblePath.
 */
export function canAccessPath(
  pathname: string,
  userPermissions: Permission[],
): boolean {
  // Always-allow paths that aren't part of the matrix.
  if (pathname.startsWith("/admin") || pathname.startsWith("/api")) {
    return true;
  }
  const required = getRequiredPermissionsForPath(pathname);
  if (!required.length) return true;
  return required.some((p) => userPermissions.includes(p));
}

/**
 * Ordered fallback list used to pick a safe landing path when the user
 * tries to navigate to a page their permissions don't allow (including
 * the post-login default of /dashboard).
 *
 * Order matters — pages are checked top-to-bottom and the first match
 * wins. We prefer pages with broad visibility (dashboard, then read-only
 * operational views) over deep settings panes. /settings/profile is the
 * universal terminator: page-access lists it with no required
 * permissions, so every authenticated user can reach it.
 */
const FALLBACK_LANDING_ORDER: string[] = [
  "/dashboard",
  "/leaves",
  "/timesheets",
  "/payroll",
  "/announcements",
  "/employees",
  "/reports",
  "/hr-center",
  "/hr-requests",
  "/tasks",
  "/learning",
  "/assets",
  "/requisitions",
  "/expenses",
  "/benefits",
  "/budget-requisitions",
  "/recruitment",
  "/employee-journeys",
  "/performance",
  "/settings",
  "/settings/profile",
];

/**
 * Return the first path in FALLBACK_LANDING_ORDER that the user can
 * access. /settings/profile is always allowed, so this always returns a
 * non-null string.
 */
export function findFirstAccessiblePath(userPermissions: Permission[]): string {
  for (const path of FALLBACK_LANDING_ORDER) {
    if (canAccessPath(path, userPermissions)) return path;
  }
  // Defensive — should be unreachable because /settings/profile has
  // empty required permissions, but return it explicitly anyway.
  return "/settings/profile";
}

