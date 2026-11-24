import { PAGE_PERMISSIONS, type Permission } from './permissions'

// Explicit module associations keep shared permission scopes visible without
// changing stored grants or inferring access from a page name.
const modules: [string, string, string[]][] = [
  ['employees', 'Employees', ['employees', 'emp_write', 'employee_compensation', 'emp_delete']],
  ['dtr', 'DTR Records', ['dtr', 'dtr_write', 'dtr_approve', 'rest_day_approvals']],
  ['time_corrections', 'Time Entry Corrections', ['time_corrections', 'corrections_approve']],
  ['biometric_devices', 'Biometric Terminals', ['biometric_devices', 'biometrics_manage']],
  ['attendance_settings', 'Attendance Settings & Facial Recognition', ['attendance_settings', 'face_verification']],
  ['schedules', 'Work Schedules', ['schedules', 'schedule_edit']],
  ['holidays', 'Holiday Calendar', ['holidays', 'holiday_edit']],
  ['leaves', 'Leave Requests', ['leaves', 'leave_write', 'leave_approve']],
  ['leave_encashments_view', 'Leave Encashment', ['leave_encashments_view', 'leave_encashments']],
  ['payroll', 'Payroll Runs', ['payroll', 'pay_write', 'pay_approve', 'pay_lock']],
  ['pay_settings', 'Payroll Settings & Income Types', ['pay_settings', 'income_types']],
  ['thirteenth', '13th Month Pay', ['thirteenth', 'thirteenth_generate']],
  ['loans', 'Loans & Cash Advances', ['loans', 'loans_write', 'cash_advance']],
  ['final_pay', 'Final Pay', ['final_pay', 'final_pay_edit']],
  ['expenses', 'Expense Claims', ['expenses', 'expenses_approve', 'expense_types']],
  ['budget_requisitions', 'Budget Requisitions', ['budget_requisitions', 'budget_approve']],
  ['salarychanges', 'Salary Changes', ['salarychanges', 'salaryapprovals']],
  ['tasks', 'Tasks', ['tasks', 'tasks_write', 'tasks_manage']],
  ['learning', 'Learning & Certifications', ['learning', 'learning_courses', 'certificate_templates']],
  ['setup_journey', 'Company Setup Journey', ['setup_journey', 'setup_journey_update']],
  ['settings', 'Company Settings', ['settings', 'settings_write']],
  ['approvals', 'Approval Workflows', ['approvals', 'approvals_manage']],
  ['audit', 'Audit & Compliance', ['audit', 'audit_read']],
  ['billing', 'Billing', ['billing', 'billing_manage']],
]
export type PermissionMatrixRow = {
  key: string; label: string; read: Permission[]; write: Permission[]; actions: string[]
}
export const PERMISSION_MATRIX_GROUPS = PAGE_PERMISSIONS.map(group => {
  const rows = new Map<string, PermissionMatrixRow>()
  for (const page of group.pages) {
    const module = modules.find(([, , keys]) => keys.includes(page.key))
    const key = module?.[0] ?? page.key
    let row = rows.get(key)
    if (!row) {
      row = { key, label: module?.[1] ?? page.label, read: [], write: [], actions: [] }
      rows.set(key, row)
    }
    const permissions = page.permission.endsWith(':read') ? row.read : row.write
    if (!permissions.includes(page.permission)) permissions.push(page.permission)
    row.actions.push(page.label)
  }
  return { group: group.group, rows: [...rows.values()] }
})

export function permissionSelection(granted: ReadonlySet<Permission>, permissions: Permission[]) {
  const count = permissions.filter(permission => granted.has(permission)).length
  return { checked: permissions.length > 0 && count === permissions.length, partial: count > 0 && count < permissions.length }
}

export function togglePermissionSelection(granted: ReadonlySet<Permission>, permissions: Permission[]) {
  const next = new Set(granted)
  const remove = permissionSelection(granted, permissions).checked
  for (const permission of permissions) {
    if (remove) next.delete(permission)
    else next.add(permission)
  }
  return next
}
