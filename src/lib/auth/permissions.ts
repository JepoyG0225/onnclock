export type UserRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'HR_MANAGER' | 'PAYROLL_OFFICER' | 'EMPLOYEE'

export type Permission =
  | 'employees:read'
  | 'employees:write'
  | 'employees:delete'
  | 'payroll:read'
  | 'payroll:write'
  | 'payroll:approve'
  | 'payroll:lock'
  | 'leaves:read'
  | 'leaves:write'
  | 'leaves:approve'
  | 'dtr:read'
  | 'dtr:write'
  | 'dtr:approve'
  | 'reports:generate'
  | 'loans:read'
  | 'loans:write'
  | 'settings:read'
  | 'settings:write'
  | 'users:manage'
  | 'departments:write'

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [
    'employees:read', 'employees:write', 'employees:delete',
    'payroll:read', 'payroll:write', 'payroll:approve', 'payroll:lock',
    'leaves:read', 'leaves:write', 'leaves:approve',
    'dtr:read', 'dtr:write', 'dtr:approve',
    'reports:generate',
    'loans:read', 'loans:write',
    'settings:read', 'settings:write',
    'users:manage',
    'departments:write',
  ],
  COMPANY_ADMIN: [
    'employees:read', 'employees:write', 'employees:delete',
    'payroll:read', 'payroll:write', 'payroll:approve', 'payroll:lock',
    'leaves:read', 'leaves:write', 'leaves:approve',
    'dtr:read', 'dtr:write', 'dtr:approve',
    'reports:generate',
    'loans:read', 'loans:write',
    'settings:read', 'settings:write',
    'users:manage',
    'departments:write',
  ],
  HR_MANAGER: [
    'employees:read', 'employees:write',
    'payroll:read',
    'leaves:read', 'leaves:write', 'leaves:approve',
    'dtr:read', 'dtr:write', 'dtr:approve',
    'reports:generate',
    'loans:read',
    'settings:read',
    'departments:write',
  ],
  PAYROLL_OFFICER: [
    'employees:read',
    'payroll:read', 'payroll:write',
    'leaves:read',
    'dtr:read',
    'reports:generate',
    'loans:read', 'loans:write',
    'settings:read',
  ],
  EMPLOYEE: [
    'leaves:read', 'leaves:write',
    'dtr:read',
  ],
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
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
// Each nav page requires at least ONE of its listed permissions to be visible.
export interface NavPermission {
  key: string          // unique page key
  label: string        // human-readable name
  permission: Permission
}

export const PAGE_PERMISSIONS: { group: string; pages: NavPermission[] }[] = [
  {
    group: 'Dashboard',
    pages: [
      { key: 'dashboard',    label: 'Dashboard',         permission: 'employees:read' },
    ],
  },
  {
    group: 'Employees',
    pages: [
      { key: 'employees',    label: 'All Employees',      permission: 'employees:read' },
      { key: 'emp_write',    label: 'Add / Edit Employee',permission: 'employees:write' },
      { key: 'emp_delete',   label: 'Delete Employee',    permission: 'employees:delete' },
      { key: 'departments',  label: 'Departments',        permission: 'departments:write' },
      { key: 'positions',    label: 'Positions',          permission: 'departments:write' },
    ],
  },
  {
    group: 'Time & Attendance',
    pages: [
      { key: 'dtr',          label: 'Weekly Time Sheets', permission: 'dtr:read' },
      { key: 'dtr_write',    label: 'Edit DTR Records',   permission: 'dtr:write' },
      { key: 'dtr_approve',  label: 'Approve DTR',        permission: 'dtr:approve' },
      { key: 'gps_map',      label: 'Live GPS Map',       permission: 'dtr:read' },
      { key: 'schedules',    label: 'Work Schedules',     permission: 'settings:read' },
      { key: 'holidays',     label: 'Holiday Calendar',   permission: 'settings:read' },
    ],
  },
  {
    group: 'Leave Management',
    pages: [
      { key: 'leaves',       label: 'Leave Requests',     permission: 'leaves:read' },
      { key: 'leave_write',  label: 'Submit Leave',       permission: 'leaves:write' },
      { key: 'leave_approve',label: 'Approve Leave',      permission: 'leaves:approve' },
      { key: 'leave_types',  label: 'Leave Types',        permission: 'settings:write' },
    ],
  },
  {
    group: 'Payroll',
    pages: [
      { key: 'payroll',      label: 'Payroll Runs',       permission: 'payroll:read' },
      { key: 'pay_write',    label: 'Create / Compute',   permission: 'payroll:write' },
      { key: 'pay_approve',  label: 'Approve Payroll',    permission: 'payroll:approve' },
      { key: 'pay_lock',     label: 'Lock Payroll',       permission: 'payroll:lock' },
      { key: 'thirteenth',   label: '13th Month Pay',     permission: 'payroll:read' },
    ],
  },
  {
    group: 'Loans',
    pages: [
      { key: 'loans',        label: 'View Loans',         permission: 'loans:read' },
      { key: 'loans_write',  label: 'Create / Edit Loans',permission: 'loans:write' },
    ],
  },
  {
    group: 'Reports',
    pages: [
      { key: 'reports',      label: 'Government Reports', permission: 'reports:generate' },
    ],
  },
  {
    group: 'Settings & Admin',
    pages: [
      { key: 'settings',     label: 'Company Settings',   permission: 'settings:read' },
      { key: 'settings_write',label: 'Edit Settings',     permission: 'settings:write' },
      { key: 'users',        label: 'User Management',    permission: 'users:manage' },
      { key: 'permissions',  label: 'Role Permissions',   permission: 'users:manage' },
    ],
  },
]
