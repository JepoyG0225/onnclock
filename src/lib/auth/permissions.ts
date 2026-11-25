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
  | 'overtime:approve'
  | 'cashadvance:approve'
  | 'audit:read'
  | 'billing:manage'
  // Task Management. `tasks:read` only views tasks; `tasks:write` allows
  // creating and working on assigned tasks; `tasks:manage` additionally allows administering
  // statuses and labels and editing anyone's task.
  | 'tasks:write'
  | 'tasks:read'
  | 'tasks:manage'
  | 'hrrequests:manage'
  | 'contracts:manage'
  | 'compliance:manage'
  | 'documents:manage'
  | 'ssscases:manage'
  | 'wageorders:manage'
  | 'profilechanges:manage'
  | 'salarychanges:manage'
  | 'salarychanges:approve'
  | 'safety:manage'

// Every permission — used to grant full access to admin roles.
export const ALL_PERMISSIONS: Permission[] = [
  'employees:read', 'employees:write', 'employees:delete', 'departments:write', 'analytics:read',
  'recruitment:manage', 'onboarding:manage', 'performance:manage', 'offboarding:manage',
  'disciplinary:manage', 'assets:manage', 'announcements:write',
  'dtr:read', 'dtr:write', 'dtr:approve', 'corrections:approve', 'overtime:approve', 'biometrics:manage',
  'leaves:read', 'leaves:write', 'leaves:approve',
  'payroll:read', 'payroll:write', 'payroll:approve', 'payroll:lock',
  'loans:read', 'loans:write', 'cashadvance:approve', 'budget:read', 'budget:approve',
  'expenses:read', 'expenses:approve', 'benefits:manage', 'learning:manage', 'reports:generate',
  'settings:read', 'settings:write', 'approvals:manage', 'users:manage', 'billing:manage', 'audit:read',
  'tasks:read', 'tasks:write', 'tasks:manage', 'hrrequests:manage', 'contracts:manage', 'compliance:manage', 'documents:manage', 'ssscases:manage', 'wageorders:manage', 'profilechanges:manage', 'salarychanges:manage', 'salarychanges:approve', 'safety:manage',
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
    'tasks:read', 'tasks:write', 'tasks:manage', 'hrrequests:manage', 'contracts:manage', 'compliance:manage', 'documents:manage', 'ssscases:manage', 'wageorders:manage', 'profilechanges:manage', 'salarychanges:manage', 'salarychanges:approve', 'safety:manage',
  ],
  PAYROLL_OFFICER: [
    'employees:read',
    'dtr:read', 'overtime:approve',
    'leaves:read',
    'payroll:read', 'payroll:write',
    'loans:read', 'loans:write', 'cashadvance:approve', 'budget:read', 'expenses:read', 'expenses:approve',
    'reports:generate',
    'settings:read',
    'tasks:read', 'tasks:write',
    'expenses:read',
  ],
  // Employees can see the company's tasks and work on what they're assigned,
  // but not administer statuses or labels.
  EMPLOYEE: [
    'leaves:read', 'leaves:write',
    'dtr:read',
    'tasks:read', 'tasks:write',
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
  '/leaves/encashments': 'payroll:read',
  '/leaves/types': 'settings:write',
  '/leaves/calendar': 'leaves:read',
  '/leaves': 'leaves:read',

  // Payroll & finance
  '/payroll/settings': 'settings:write',
  '/payroll': 'payroll:read',
  '/thirteenth-month': 'payroll:read',
  '/tax-annualization': 'payroll:read',
  '/final-pay': 'payroll:write',
  '/loans': 'loans:read',
  '/cash-advance': 'cashadvance:approve',
  '/budget-requisitions': 'budget:read',
  '/requisitions': 'budget:read',
  '/expenses': 'expenses:read',
  '/benefits': 'benefits:manage',
  '/learning': 'learning:manage',

  // Task management
  '/tasks': 'tasks:read',
  '/hr-requests': 'hrrequests:manage',
  '/hr-center': 'contracts:manage',

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
  if(pathname === '/requisitions' || pathname.startsWith('/requisitions/')) return ['budget:read','budget:approve','payroll:read','employees:read','expenses:read','expenses:approve'].some(p=>granted.includes(p))
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
  paths?: string[]     // Explicit module routes covered by this checklist entry
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
export const WORKSPACE_GROUP = 'Workspace'
export const TASK_MANAGEMENT_GROUP = WORKSPACE_GROUP

export const PAGE_PERMISSIONS: { group: string; pages: NavPermission[] }[] = [
  {
    group: 'Dashboard',
    pages: [
      { key: 'dashboard',          label: 'Dashboard',                permission: 'employees:read', paths: ["/dashboard"] },
      { key: 'analytics',          label: 'HR Analytics',             permission: 'analytics:read', paths: ["/analytics"] },
    ],
  },
  {
    group: 'People',
    pages: [
      { key: 'employees',          label: 'All Employees',            permission: 'employees:read', paths: ["/employees", "/employee-files"] },
      { key: 'emp_write',          label: 'Add / Edit Employee',      permission: 'employees:write' },
      { key: 'employee_compensation', label: 'Edit Compensation & Pay Exclusions (OT / ND / Holiday)', permission: 'employees:write' },
      { key: 'emp_delete',         label: 'Delete Employee',          permission: 'employees:delete' },
      { key: 'organization',       label: 'Organization',             permission: 'departments:write', paths: ["/organization", "/departments", "/positions"] },
      { key: 'org_chart', label: 'Organization Chart', permission: 'employees:read', paths: ['/org-chart'] },
      { key: 'recruitment',        label: 'Recruitment (Hiring / Onboarding / Offboarding)', permission: 'recruitment:manage', paths: ["/recruitment"] },
      { key: 'performance',        label: 'Performance',              permission: 'performance:manage', paths: ["/performance", "/performance-reviews"] },
      { key: 'onboarding', label: 'Manage Onboarding', permission: 'onboarding:manage', paths: ["/onboarding"] },
      { key: 'offboarding', label: 'Manage Offboarding', permission: 'offboarding:manage', paths: ["/offboarding"] },
      { key: 'disciplinary', label: 'Manage Disciplinary Records', permission: 'disciplinary:manage', paths: ["/disciplinary"] },
    ],
  },
  {
    group: 'Time & Attendance',
    pages: [
      { key: 'dtr',                label: 'Time Sheets',              permission: 'dtr:read', paths: ["/timesheets", "/dtr"] },
      { key: 'dtr_write',          label: 'Edit DTR Records',         permission: 'dtr:write' },
      { key: 'dtr_approve',        label: 'Approve DTR',              permission: 'dtr:approve' },
      { key: 'gps_map',            label: 'Live GPS Map',             permission: 'dtr:read', paths: ["/attendance/map"] },
      { key: 'daily_activities', label: 'View Daily Activity Logs & Photos', permission: 'dtr:read' },
      { key: 'rest_day_approvals', label: 'Approve Rest-Day Shifts', permission: 'dtr:approve' },
      { key: 'face_verification', label: 'Configure Facial Recognition & Office Scanner', permission: 'settings:write' },
      { key: 'schedule_edit', label: 'Create / Edit Work Schedules', permission: 'dtr:write' },
      { key: 'holiday_edit', label: 'Manage / Sync Holidays', permission: 'settings:write' },
      { key: 'attendance_reports', label: 'Attendance & Daily Activity Reports', permission: 'dtr:read', paths: ["/attendance/reports"] },
      { key: 'corrections_approve', label: 'Approve Time Corrections', permission: 'corrections:approve' },
      { key: 'overtime_approve', label: 'Approve Overtime', permission: 'overtime:approve', paths: ["/overtime-requests"] },
      { key: 'biometrics_manage', label: 'Manage Biometric Devices', permission: 'biometrics:manage' },
      { key: 'time_corrections',   label: 'Time Entry Corrections',   permission: 'dtr:read', paths: ["/time-corrections"] },
      { key: 'biometric_devices',  label: 'Biometric Terminals',      permission: 'settings:read', paths: ["/biometric-devices"] },
      { key: 'attendance_settings',label: 'View Attendance Settings', permission: 'settings:read', paths: ["/attendance/settings", "/settings/attendance"] },
      { key: 'schedules',          label: 'Work Schedules',           permission: 'settings:read', paths: ["/schedules"] },
      { key: 'holidays',           label: 'Holiday Calendar',         permission: 'settings:read', paths: ["/holidays"] },
    ],
  },
  {
    group: 'Leave Management',
    pages: [
      { key: 'leaves',             label: 'Leave Requests',           permission: 'leaves:read', paths: ["/leaves"] },
      { key: 'leave_write',        label: 'Submit Leave',             permission: 'leaves:write' },
      { key: 'leave_approve',      label: 'Approve Leave',            permission: 'leaves:approve' },
      { key: 'leave_calendar',     label: 'Team Calendar',            permission: 'leaves:read', paths: ["/leaves/calendar"] },
      { key: 'leave_types',        label: 'Leave Types',              permission: 'settings:write', paths: ["/leaves/types"] },
      { key: 'leave_encashments_view', label: 'Leave Encashment', permission: 'payroll:read', paths: ['/leaves/encashments'] },
      { key: 'leave_encashments', label: 'Convert Leave Credits to Cash / Generate Bulk Encashment Payroll', permission: 'payroll:write' },
      { key: 'leave_credits', label: 'Leave Credits', permission: 'leaves:read', paths: ["/leaves/credits"] },
    ],
  },
  {
    group: 'Payroll & Finance',
    pages: [
      { key: 'payroll',            label: 'Payroll Runs',             permission: 'payroll:read', paths: ["/payroll"] },
      { key: 'pay_reconciliation', label: 'Payroll Reconciliation', permission: 'payroll:read', paths: ['/payroll/reconciliation'] },
      { key: 'payslip_design', label: 'Edit Payslip Design (Theme, Sections, Header & Footer)', permission: 'payroll:write' },
      { key: 'tax_annualization', label: 'Tax Annualization', permission: 'payroll:read', paths: ['/tax-annualization'] },
      { key: 'income_types', label: 'Manage Payroll Income Types', permission: 'settings:write' },
      { key: 'pay_write',          label: 'Create / Compute',         permission: 'payroll:write' },
      { key: 'pay_approve',        label: 'Approve Payroll',          permission: 'payroll:approve' },
      { key: 'pay_lock',           label: 'Lock Payroll / Mark Disbursed',             permission: 'payroll:lock' },
      { key: 'pay_settings',       label: 'Payroll Settings',         permission: 'settings:write', paths: ["/payroll/settings"] },
      { key: 'thirteenth',         label: '13th Month Pay',           permission: 'payroll:read', paths: ["/thirteenth-month"] },
      { key: 'thirteenth_generate', label: 'Compute & generate 13th-month payroll (tax review)', permission: 'payroll:write' },
      { key: 'loans',              label: 'View Loans',               permission: 'loans:read', paths: ["/loans"] },
      { key: 'loans_write',        label: 'Create / Edit Loans, Mark Paid / Revert',      permission: 'loans:write' },
      { key: 'cash_advance',       label: 'Cash Advance',             permission: 'cashadvance:approve', paths: ["/cash-advance"] },
      { key: 'final_pay',          label: 'View Final Pay',           permission: 'payroll:read', paths: ["/final-pay"] },
      { key: 'final_pay_edit', label: 'Compute Final Pay / Generate or Add to Unapproved Payroll', permission: 'payroll:write' },
      { key: 'expenses',           label: 'Requisitions and Expense Claims: Expenses', permission: 'expenses:read', paths: ["/expenses", "/requisitions"] },
      { key: 'expenses_approve',   label: 'Approve Expenses',         permission: 'expenses:approve' },
      { key: 'expense_types', label: 'Manage Expense Types & Reimbursements', permission: 'expenses:approve' },
      { key: 'integrations', label: 'Business Integrations (Currently Hidden)', permission: 'settings:write', paths: ['/integrations'] },
      { key: 'benefits',           label: 'Benefits & HMO',           permission: 'benefits:manage', paths: ["/benefits"] },
      { key: 'budget_requisitions', label: 'Requisitions and Expense Claims: Budgets', permission: 'budget:read', paths: ["/budget-requisitions", "/requisitions"] },
      { key: 'budget_approve', label: 'Approve Budget Requisitions', permission: 'budget:approve' },
    ],
  },
  {
    group: WORKSPACE_GROUP,
    pages: [
      { key: 'hr_requests', label: 'HR Helpdesk & Document Requests', permission: 'hrrequests:manage', paths: ["/hr-requests"] },
      { key: 'contracts', label: 'Contracts & regularization', permission: 'contracts:manage', paths: ["/hr-center"] },
      { key: 'compliance', label: 'Government compliance', permission: 'compliance:manage' },
      { key: 'documents', label: 'HR documents & templates (create, edit, delete templates)', permission: 'documents:manage' },
      { key: 'ssscases', label: 'SSS benefit cases', permission: 'ssscases:manage' },
      { key: 'wageorders', label: 'Wage-order checks', permission: 'wageorders:manage' },
      { key: 'salarychanges', label: 'Salary changes', permission: 'salarychanges:manage' },
      { key: 'salaryapprovals', label: 'Approve salary changes', permission: 'salarychanges:approve' },
      { key: 'safety', label: 'Workplace safety', permission: 'safety:manage' },
      { key: 'profilechanges', label: 'Profile changes & privacy', permission: 'profilechanges:manage' },
      { key: 'tasks',              label: 'Tasks',                    permission: 'tasks:read', paths: ["/tasks"] },
      { key: 'tasks_write', label: 'Create & Update Assigned Tasks', permission: 'tasks:write' },
      { key: 'tasks_manage',       label: 'Manage Statuses & Labels', permission: 'tasks:manage' },
      { key: 'assets',             label: 'Assets & Equipment',       permission: 'assets:manage', paths: ["/assets"] },
      { key: 'learning',           label: 'Learning & Certifications', permission: 'learning:manage', paths: ["/learning"] },
      { key: 'learning_courses', label: 'Manage Courses & Progress Reports', permission: 'learning:manage' },
      { key: 'certificate_templates', label: 'Manage Certifications & Certificate Templates', permission: 'learning:manage' },
      { key: 'announcements',      label: 'Announcements',            permission: 'announcements:write', paths: ["/announcements"] },
    ],
  },
  {
    group: 'Reports',
    pages: [
      { key: 'sss_reports', label: 'SSS R3 Reports', permission: 'reports:generate', paths: ['/reports/sss'] },
      { key: 'philhealth_reports', label: 'PhilHealth RF-1 Reports', permission: 'reports:generate', paths: ['/reports/philhealth'] },
      { key: 'pagibig_reports', label: 'Pag-IBIG MCRF Reports', permission: 'reports:generate', paths: ['/reports/pagibig'] },
      { key: 'bir_reports', label: 'BIR Reports', permission: 'reports:generate', paths: ['/reports/bir'] },
      { key: 'reports',            label: 'Government Reports',       permission: 'reports:generate', paths: ["/reports"] },
      { key: 'analytics_access', label: 'Analytics Access', permission: 'analytics:read' },
    ],
  },
  {
    group: 'Settings & Admin',
    pages: [
      { key: 'setup_journey', label: 'View Company Setup Journey', permission: 'settings:read', paths: ['/api/setup-journey'] },
      { key: 'setup_journey_update', label: 'Update Company Setup Checklist', permission: 'settings:write' },
      { key: 'settings',           label: 'Company Settings',         permission: 'settings:read', paths: ["/settings"] },
      { key: 'settings_write',     label: 'Edit Settings',            permission: 'settings:write' },
      { key: 'approvals',          label: 'Approval Workflows',       permission: 'settings:write', paths: ["/settings/approvals"] },
      { key: 'approvals_manage', label: 'Manage Approval Workflows', permission: 'approvals:manage', paths: ["/settings/workflows"] },
      { key: 'payroll_rules',      label: 'Shift Differential',       permission: 'settings:write', paths: ["/settings/payroll-rules"] },
      { key: 'audit',              label: 'Audit & Compliance',       permission: 'users:manage', paths: ["/settings/audit"] },
      { key: 'audit_read', label: 'Read Audit Records', permission: 'audit:read' },
      { key: 'billing',            label: 'Billing',                  permission: 'users:manage', paths: ["/settings/billing", "/billing"] },
      { key: 'billing_manage', label: 'Manage Billing', permission: 'billing:manage' },
      { key: 'users',              label: 'User Management',          permission: 'users:manage', paths: ["/settings/users"] },
      { key: 'permissions',        label: 'Role Permissions',         permission: 'users:manage', paths: ["/settings/permissions"] },
    ],
  },
]
