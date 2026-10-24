export type UserRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'HR_MANAGER' | 'PAYROLL_OFFICER' | 'EMPLOYEE'

export type Permission =
  // Core
  | 'employees:read'
  | 'employees:write'
  | 'employees:delete'
  | 'departments:write'
  | 'analytics:read'
  // HR suite
  | 'recruitment:manage'
  | 'onboarding:manage'
  | 'performance:manage'
  | 'offboarding:manage'
  | 'disciplinary:manage'
  | 'assets:manage'
  | 'announcements:write'
  // Time & attendance
  | 'dtr:read'
  | 'dtr:write'
  | 'dtr:approve'
  | 'corrections:approve'
  | 'overtime:approve'
  | 'biometrics:manage'
  // Leave
  | 'leaves:read'
  | 'leaves:write'
  | 'leaves:approve'
  // Payroll & finance
  | 'payroll:read'
  | 'payroll:write'
  | 'payroll:approve'
  | 'payroll:lock'
  | 'loans:read'
  | 'loans:write'
  | 'cashadvance:approve'
  | 'budget:read'
  | 'budget:approve'
  | 'disbursement:manage'
  | 'expenses:read'
  | 'expenses:approve'
  | 'benefits:manage'
  | 'learning:manage'
  | 'reports:generate'
  // Settings & admin
  | 'settings:read'
  | 'settings:write'
  | 'approvals:manage'
  | 'users:manage'
  | 'departments:write'
  // Module-specific keys for finer-grained custom roles. A user only
  // needs ONE of the alternative permissions listed for a route to
  // access it — see page-access.ts. Built-in roles still keep the
  // coarse-grained permissions above, so they're unaffected.
  | 'announcements:write'
  | 'performance:manage'
  | 'recruitment:manage'
  | 'onboarding:manage'
  | 'offboarding:manage'
  | 'disciplinary:manage'
  | 'assets:manage'
  | 'budget:read'
  | 'budget:approve'
  | 'disbursement:manage'
  | 'overtime:approve'
  | 'cashadvance:approve'
  | 'audit:read'
  | 'billing:manage'
  // Task Management. `tasks:read` opens the module and allows creating and
  // working on tasks; `tasks:manage` additionally allows administering
  // statuses and labels and editing anyone's task.
  | 'tasks:read'
  | 'tasks:manage'

// Every permission — used to grant full access to admin roles.
export const ALL_PERMISSIONS: Permission[] = [
  'employees:read', 'employees:write', 'employees:delete', 'departments:write', 'analytics:read',
  'recruitment:manage', 'onboarding:manage', 'performance:manage', 'offboarding:manage',
  'disciplinary:manage', 'assets:manage', 'announcements:write',
  'dtr:read', 'dtr:write', 'dtr:approve', 'corrections:approve', 'overtime:approve', 'biometrics:manage',
  'leaves:read', 'leaves:write', 'leaves:approve',
  'payroll:read', 'payroll:write', 'payroll:approve', 'payroll:lock',
  'loans:read', 'loans:write', 'cashadvance:approve', 'budget:read', 'budget:approve',
  'disbursement:manage', 'expenses:read', 'expenses:approve', 'benefits:manage', 'learning:manage', 'reports:generate',
  'settings:read', 'settings:write', 'approvals:manage', 'users:manage', 'billing:manage', 'audit:read',
  'tasks:read', 'tasks:manage',
]

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  COMPANY_ADMIN: [...ALL_PERMISSIONS],
  HR_MANAGER: [
    'employees:read', 'employees:write', 'departments:write', 'analytics:read',
    'recruitment:manage', 'onboarding:manage', 'performance:manage', 'offboarding:manage',
    'disciplinary:manage', 'assets:manage', 'announcements:write',
    'dtr:read', 'dtr:write', 'dtr:approve', 'corrections:approve', 'overtime:approve', 'biometrics:manage',
    'leaves:read', 'leaves:write', 'leaves:approve',
    'payroll:read', 'loans:read', 'cashadvance:approve', 'budget:read', 'budget:approve', 'expenses:read', 'expenses:approve', 'benefits:manage', 'learning:manage',
    'reports:generate',
    'settings:read', 'approvals:manage', 'audit:read',
    'tasks:read', 'tasks:manage',
  ],
  PAYROLL_OFFICER: [
    'employees:read',
    'dtr:read', 'overtime:approve',
    'leaves:read',
    'payroll:read', 'payroll:write',
    'loans:read', 'loans:write', 'cashadvance:approve', 'budget:read', 'disbursement:manage', 'expenses:read', 'expenses:approve',
    'reports:generate',
    'settings:read',
    'tasks:read',
    'expenses:read',
  ],
  // Employees can see the company's tasks and work on what they're assigned,
  // but not administer statuses or labels.
  EMPLOYEE: [
    'leaves:read', 'leaves:write',
    'dtr:read',
    'tasks:read',
  ],
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

// ─── Route → required-permission map ────────────────────────────────────────
// Maps a dashboard route to the permission a user must hold to open it. Used to
// (1) filter the sidebar and (2) guard direct navigation. Most specific (longest)
// matching prefix wins, so `/leaves/types` can require a different permission than
// `/leaves`. Routes NOT listed here are unrestricted (fail-open) so new pages are
// never accidentally locked. Admin roles bypass this entirely.
export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  '/dashboard': 'employees:read',
  '/analytics': 'analytics:read',

  // Employment
  '/employees': 'employees:read',
  '/employee-files': 'employees:read',
  '/organization': 'departments:write',
  '/departments': 'departments:write',
  '/positions': 'departments:write',
  '/org-chart': 'employees:read',
  '/recruitment': 'recruitment:manage',
  '/onboarding': 'onboarding:manage',
  '/performance': 'performance:manage',
  '/performance-reviews': 'performance:manage',
  '/offboarding': 'offboarding:manage',
  '/disciplinary': 'disciplinary:manage',
  '/assets': 'assets:manage',

  // Time & attendance
  '/timesheets': 'dtr:read',
  '/dtr': 'dtr:read',
  '/attendance/map': 'dtr:read',
  '/attendance/tardiness': 'dtr:read',
  '/attendance/settings': 'settings:write',
  '/time-corrections': 'corrections:approve',
  '/overtime-requests': 'overtime:approve',
  '/biometric-devices': 'biometrics:manage',
  '/schedules': 'settings:read',
  '/holidays': 'settings:read',

  // Leave (more specific first via longest-prefix match)
  '/leaves/types': 'settings:write',
  '/leaves/calendar': 'leaves:read',
  '/leaves': 'leaves:read',

  // Payroll & finance
  '/payroll/settings': 'settings:write',
  '/payroll': 'payroll:read',
  '/thirteenth-month': 'payroll:read',
  '/tax-annualization': 'payroll:read',
  '/final-pay': 'payroll:write',
  '/disbursement': 'disbursement:manage',
  '/loans': 'loans:read',
  '/cash-advance': 'cashadvance:approve',
  '/budget-requisitions': 'budget:read',
  '/expenses': 'expenses:read',
  '/benefits': 'benefits:manage',
  '/learning': 'learning:manage',

  // Task management
  '/tasks': 'tasks:read',

  // Reports
  '/reports': 'reports:generate',

  // Communication
  '/announcements': 'announcements:write',

  // Settings & admin (subpaths first)
  '/settings/users': 'users:manage',
  '/settings/permissions': 'users:manage',
  '/settings/approvals': 'approvals:manage',
  '/settings/workflows': 'approvals:manage',
  '/settings/payroll-rules': 'settings:write',
  '/settings/billing': 'billing:manage',
  '/settings/audit': 'audit:read',
  '/settings': 'settings:read',
  '/billing': 'billing:manage',
}

/**
 * The permission required to open `pathname`, or null if the route is
 * unrestricted. Resolves by longest matching prefix so nested routes
 * (e.g. /payroll/settings) can require a stricter permission than their parent.
 */
export function routePermission(pathname: string): Permission | null {
  let best: { prefix: string; permission: Permission } | null = null
  for (const [prefix, permission] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      if (!best || prefix.length > best.prefix.length) best = { prefix, permission }
    }
  }
  return best?.permission ?? null
}

/** Whether a user holding `granted` permissions may open `pathname`. */
export function canAccessRoute(pathname: string, granted: readonly string[]): boolean {
  const required = routePermission(pathname)
  if (!required) return true // unrestricted route
  return granted.includes(required)
}

export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  COMPANY_ADMIN: 'Company Admin',
  HR_MANAGER: 'HR Manager',
  PAYROLL_OFFICER: 'Payroll Officer',
  EMPLOYEE: 'Employee',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-800',
  COMPANY_ADMIN: 'bg-blue-100 text-blue-800',
  HR_MANAGER: 'bg-green-100 text-green-800',
  PAYROLL_OFFICER: 'bg-yellow-100 text-yellow-800',
  EMPLOYEE: 'bg-gray-100 text-gray-800',
}

// ─── Page → Permission mapping ──────────────────────────────────────────────
// Catalog of every feature/page in the app, grouped like the sidebar. Drives
// the Role Permissions settings matrix. Keep this in sync with the nav as new
// features ship.
export interface NavPermission {
  key: string          // unique page key
  label: string        // human-readable name
  permission: Permission
}

// PAGE_PERMISSIONS mirrors EVERY entry that appears in the sidebar
// (NAV_ITEMS in AppSidebar). Each row is a toggle the Company Admin
// sees in Settings → Role Permissions. The grouping mirrors the
// sidebar groups so the matrix and the navigation read identically.
//
// The `permission` column is the SAME Permission key the runtime
// guard (src/lib/auth/page-access.ts) checks for that route — so
// ticking a row in the matrix really grants the same access the
// sidebar/route-guard enforce. When a single route is gated by an
// OR of multiple permissions in page-access (e.g. /budget-requisitions
// accepts payroll:read OR employees:read), this table lists the
// primary one — granting it is sufficient.
/**
 * Group label for the Task Management module. Exported so the Role Permissions
 * matrix can reference exactly this group without string-matching a literal
 * that could drift if the label is reworded. (It was used to hide the group
 * during the beta; the module is now generally available, and the matrix only
 * hides it from an admin whose own role has tasks:read revoked.)
 */
export const TASK_MANAGEMENT_GROUP = 'Task Management'

export const PAGE_PERMISSIONS: { group: string; pages: NavPermission[] }[] = [
  {
    group: 'Dashboard',
    pages: [
      { key: 'dashboard',          label: 'Dashboard',                permission: 'employees:read' },
      { key: 'analytics',          label: 'HR Analytics',             permission: 'reports:generate' },
    ],
  },
  {
    group: 'People',
    pages: [
      { key: 'employees',          label: 'All Employees',            permission: 'employees:read' },
      { key: 'emp_write',          label: 'Add / Edit Employee',      permission: 'employees:write' },
      { key: 'emp_delete',         label: 'Delete Employee',          permission: 'employees:delete' },
      { key: 'organization',       label: 'Organization',             permission: 'departments:write' },
      { key: 'recruitment',        label: 'Recruitment (Hiring / Onboarding / Offboarding)', permission: 'recruitment:manage' },
      { key: 'performance',        label: 'Performance',              permission: 'performance:manage' },
      { key: 'assets',             label: 'Assets & Equipment',       permission: 'assets:manage' },
    ],
  },
  {
    group: 'Time & Attendance',
    pages: [
      { key: 'dtr',                label: 'Time Sheets',              permission: 'dtr:read' },
      { key: 'dtr_write',          label: 'Edit DTR Records',         permission: 'dtr:write' },
      { key: 'dtr_approve',        label: 'Approve DTR',              permission: 'dtr:approve' },
      { key: 'gps_map',            label: 'Live GPS Map',             permission: 'dtr:read' },
      { key: 'time_corrections',   label: 'Time Entry Corrections',   permission: 'dtr:write' },
      { key: 'biometric_devices',  label: 'Biometric Terminals',      permission: 'settings:write' },
      { key: 'attendance_settings',label: 'Attendance Settings',      permission: 'settings:write' },
      { key: 'schedules',          label: 'Work Schedules',           permission: 'settings:read' },
      { key: 'holidays',           label: 'Holiday Calendar',         permission: 'settings:read' },
    ],
  },
  {
    group: 'Leave Management',
    pages: [
      { key: 'leaves',             label: 'Leave Requests',           permission: 'leaves:read' },
      { key: 'leave_write',        label: 'Submit Leave',             permission: 'leaves:write' },
      { key: 'leave_approve',      label: 'Approve Leave',            permission: 'leaves:approve' },
      { key: 'leave_calendar',     label: 'Team Calendar',            permission: 'leaves:read' },
      { key: 'leave_types',        label: 'Leave Types',              permission: 'settings:write' },
    ],
  },
  {
    group: 'Payroll & Finance',
    pages: [
      { key: 'payroll',            label: 'Payroll Runs',             permission: 'payroll:read' },
      { key: 'pay_write',          label: 'Create / Compute',         permission: 'payroll:write' },
      { key: 'pay_approve',        label: 'Approve Payroll',          permission: 'payroll:approve' },
      { key: 'pay_lock',           label: 'Lock Payroll',             permission: 'payroll:lock' },
      { key: 'pay_settings',       label: 'Payroll Settings',         permission: 'settings:write' },
      { key: 'thirteenth',         label: '13th Month Pay',           permission: 'payroll:read' },
      { key: 'loans',              label: 'View Loans',               permission: 'loans:read' },
      { key: 'loans_write',        label: 'Create / Edit Loans',      permission: 'loans:write' },
      { key: 'cash_advance',       label: 'Cash Advance',             permission: 'cashadvance:approve' },
      { key: 'final_pay',          label: 'Final Pay',                permission: 'payroll:write' },
      { key: 'disbursement',       label: 'Payroll Disbursement',     permission: 'disbursement:manage' },
      { key: 'expenses',           label: 'Expense Claims',           permission: 'expenses:read' },
      { key: 'expenses_approve',   label: 'Approve Expenses',         permission: 'expenses:approve' },
      { key: 'benefits',           label: 'Benefits & HMO',           permission: 'benefits:manage' },
      { key: 'learning',           label: 'Learning & Certifications', permission: 'learning:manage' },
    ],
  },
  {
    group: 'Budget & Communication',
    pages: [
      { key: 'budget_requisitions',label: 'Budget Requisitions',      permission: 'budget:read' },
      { key: 'announcements',      label: 'Announcements',            permission: 'announcements:write' },
    ],
  },
  {
    group: TASK_MANAGEMENT_GROUP,
    pages: [
      { key: 'tasks',              label: 'Tasks',                    permission: 'tasks:read' },
      { key: 'tasks_manage',       label: 'Manage Statuses & Labels', permission: 'tasks:manage' },
    ],
  },
  {
    group: 'Reports',
    pages: [
      { key: 'reports',            label: 'Government Reports',       permission: 'reports:generate' },
    ],
  },
  {
    group: 'Settings & Admin',
    pages: [
      { key: 'settings',           label: 'Company Settings',         permission: 'settings:read' },
      { key: 'settings_write',     label: 'Edit Settings',            permission: 'settings:write' },
      { key: 'approvals',          label: 'Approval Workflows',       permission: 'settings:write' },
      { key: 'payroll_rules',      label: 'Shift Differential',       permission: 'settings:write' },
      { key: 'audit',              label: 'Audit & Compliance',       permission: 'users:manage' },
      { key: 'billing',            label: 'Billing',                  permission: 'users:manage' },
      { key: 'users',              label: 'User Management',          permission: 'users:manage' },
      { key: 'permissions',        label: 'Role Permissions',         permission: 'users:manage' },
    ],
  },
]
