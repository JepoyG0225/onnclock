/**
 * Per-page guided tours. Each tour is a short sequence of steps shown the first
 * time a user opens that page. Steps can optionally target an on-page element
 * (via `selector`) and/or click one first (via `click`, e.g. to open a tab).
 * Steps with no selector render as a centered explainer card.
 */
export interface TourStep {
  title: string
  body: string
  /** CSS selector of the element to spotlight (optional). */
  selector?: string
  /** CSS selector to click before showing this step (e.g. open a tab). */
  click?: string
}

export interface PageTour {
  key: string
  /** Friendly page name shown in the tour header. */
  label: string
  steps: TourStep[]
}

const TOURS: Record<string, PageTour> = {
  '/employees': {
    key: 'employees',
    label: 'Employees',
    steps: [
      { title: 'Your employee directory', body: 'This is the master list of everyone in your company. From here you can view profiles, edit details, manage portal access, and run payroll on these records.' },
      { title: 'Add an employee', body: 'Click here to create a single employee. You\'ll fill in their personal, employment, compensation, and government details.', selector: '[data-tour="add-employee"]' },
      { title: 'Bulk import', body: 'Have many employees? Download the template, fill it in, and import them all at once instead of adding one by one.', selector: '[data-tour="import-employees"]' },
      { title: 'Search & open', body: 'Search by name or employee number, then click a row to open the full profile.' },
    ],
  },
  '/employees/new': {
    key: 'employee-form',
    label: 'New Employee',
    steps: [
      { title: 'Let\'s add your first employee', body: 'We\'ll walk through each tab. Fill what you can now — you can always edit later. Required fields are marked with *.' },
      { title: 'Personal', body: 'Basic identity details: name, gender, civil status, birth date, and contact info. The employee number must be unique in your company.', click: '[data-tour="emp-tab-personal"]', selector: '[data-tour="emp-tab-personal"]' },
      { title: 'Employment', body: 'Department, position, hire date, employment status/type, and the work schedule that drives DTR and overtime computation.', click: '[data-tour="emp-tab-employment"]', selector: '[data-tour="emp-tab-employment"]' },
      { title: 'Compensation', body: 'Set the rate type (monthly/daily/hourly) and basic salary. Daily and hourly rates are derived automatically. Add allowances (other income) and deductions here too.', click: '[data-tour="emp-tab-compensation"]', selector: '[data-tour="emp-tab-compensation"]' },
      { title: 'Government IDs', body: 'SSS, PhilHealth, Pag-IBIG, and TIN numbers. These flow into payroll contributions and your statutory reports.', click: '[data-tour="emp-tab-government"]', selector: '[data-tour="emp-tab-government"]' },
      { title: 'Emergency contact', body: 'Who to reach in case of emergency — kept on the employee\'s record.', click: '[data-tour="emp-tab-emergency"]', selector: '[data-tour="emp-tab-emergency"]' },
      { title: 'Settings', body: 'Toggle payroll behaviours (tax/SSS/PhilHealth/Pag-IBIG, holiday pay, late/undertime), time-tracking, and exemptions per employee.', click: '[data-tour="emp-tab-settings"]', selector: '[data-tour="emp-tab-settings"]' },
      { title: 'Save & continue', body: 'When you\'re done, save the employee. After saving you can set their work schedule, leave entitlements, and portal access.' },
    ],
  },
  '/dtr': {
    key: 'dtr',
    label: 'Time Sheets',
    steps: [
      { title: 'Weekly time sheets', body: 'Review each employee\'s daily time records — clock in/out, tardiness, undertime, and overtime — week by week.' },
      { title: 'Add or import DTR', body: 'Add a manual entry for one employee, or use Bulk Import to upload many records from a CSV.', selector: '[data-tour="dtr-add"]' },
      { title: 'Approve', body: 'Approve a day, a whole week, or everything at once. Approved time is what payroll computes from, so review before running payroll.' },
    ],
  },
  '/payroll': {
    key: 'payroll',
    label: 'Payroll',
    steps: [
      { title: 'Payroll runs', body: 'Create a payroll run for a cut-off period, then compute earnings and deductions for all included employees.' },
      { title: 'Review → Approve → Lock', body: 'Open the run to review each payslip. Submit for approval, approve through your workflow, then lock to finalize and release payslips.' },
      { title: 'Tip', body: 'Make sure time sheets and overtime are approved before computing — the system flags anything pending so totals stay accurate.' },
    ],
  },
  '/leaves': {
    key: 'leaves',
    label: 'Leave Requests',
    steps: [
      { title: 'Leave requests', body: 'All submitted leave applications land here. Approve or reject them following your approval workflow.' },
      { title: 'Balances & types', body: 'Each request shows the employee\'s running balance. Configure leave categories and entitlements under Leave Types.' },
    ],
  },
  '/settings': {
    key: 'settings',
    label: 'Settings',
    steps: [
      { title: 'Company settings', body: 'Set your company name, address, TIN, and logo — these appear on payslips, invoices, and statutory reports.' },
      { title: 'More tabs', body: 'Use the tabs for Government IDs, Email, User Management, Role Permissions, Approval Workflows, and Billing.' },
    ],
  },
}

/** Resolve the tour for a pathname (exact match, then known nested routes). */
export function resolvePageTour(pathname: string): PageTour | null {
  if (TOURS[pathname]) return TOURS[pathname]
  return null
}
