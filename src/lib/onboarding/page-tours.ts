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
  '/assets': {
    key: 'assets',
    label: 'Assets & Equipment',
    steps: [
      { title: 'Company property', body: 'Track what your company has issued to staff - laptops, phones, ID cards, uniforms, vehicles. Each item has a status and an assignment history.' },
      { title: 'Add an asset', body: 'Register an item with its tag, serial number, purchase date and cost. Warranty dates surface later so you know what is still covered.', selector: '[data-tour="asset-add"]' },
      { title: 'Assign and return', body: 'Assigning an item to an employee records the date and its condition. When they leave, anything still assigned shows up automatically on their offboarding clearance - which is why returns should be logged here rather than informally.' },
      { title: 'Find an item fast', body: 'Search by asset tag, serial number, name, or the employee it is issued to - the quickest way to answer "who has this laptop".', selector: '[data-tour="asset-search"]' },
      { title: 'Filters', body: 'Narrow by status (available, assigned, in repair, retired, lost) or by category when you are auditing one class of equipment.' },
    ],
  },
  '/analytics': {
    key: 'analytics',
    label: 'HR Analytics',
    steps: [
      { title: 'What the numbers say', body: 'Headcount, turnover, attendance and payroll cost trends across your company - the view for questions like "are we growing" or "is overtime creeping up".' },
      { title: 'Everything is derived', body: 'Nothing here is entered by hand. Every figure comes from employees, timesheets and payroll runs, so if a number looks wrong the fix is in the source record, not here.' },
      { title: 'Headcount by department', body: 'Where your people actually sit. Useful before a reorg or when a department claims it is understaffed.', selector: '[data-tour="an-headcount"]' },
      { title: 'Hires vs separations', body: 'Joiners against leavers over time - the clearest early signal of a retention problem.', selector: '[data-tour="an-turnover"]' },
      { title: 'Leave utilisation', body: 'How much entitlement is actually being used. Low usage often means unused balances you will have to pay out later.', selector: '[data-tour="an-leave"]' },
      { title: 'Date range', body: 'Most charts respect the selected period. Widen it to spot trends, narrow it to explain one month.' },
    ],
  },
  '/announcements': {
    key: 'announcements',
    label: 'Announcements',
    steps: [
      { title: 'Company-wide notices', body: 'Post something every employee should see. It appears on their portal home and raises a notification.' },
      { title: 'Start one', body: 'Opens the composer. Anything you post here reaches every employee with portal access.', selector: '[data-tour="ann-new"]' },
      { title: 'Title', body: 'What employees see in their notification and at the top of their portal - make it scannable, since this is often all they read.', click: '[data-tour="ann-new"]', selector: '[data-tour="ann-title"]' },
      { title: 'Body', body: 'The full message. Once posted it reaches everyone immediately - there is no scheduled send, so publish when you mean it.', selector: '[data-tour="ann-body"]' },
      { title: 'History', body: 'Past announcements stay listed so you can check what was communicated and when.' },
    ],
  },
  '/budget-requisitions': {
    key: 'budget-requisitions',
    label: 'Budget Requisitions',
    steps: [
      { title: 'Spending requests', body: 'Employees request budget here and it routes through your approval workflow. This is the queue of what is waiting on a decision.' },
      { title: 'Line items', body: 'Each request breaks down into items with amounts, so approvers see exactly what the total is made of rather than one lump sum.' },
      { title: 'Attachments', body: 'Quotes and supporting documents can be attached to a request, which is usually what an approver wants before saying yes.' },
      { title: 'Approving', body: 'Approval follows the chain configured under Settings, Approval Workflows - so a large request can require a second approver without anyone remembering to ask.' },
    ],
  },
  '/final-pay': {
    key: 'final-pay',
    label: 'Final Pay',
    steps: [
      { title: 'Last pay for a leaver', body: 'Computes what is owed when someone exits: unpaid salary, pro-rated 13th month, unused leave conversion, less any outstanding loan balance.' },
      { title: 'Pick the employee', body: 'Search for the departing employee and set their last day. The computation reads their attendance and loan balances up to that date.', selector: '[data-tour="fp-employee"]' },
      { title: 'Amounts', body: 'Each component is computed for you but stays editable - leave a field on auto unless you have a reason to override, and note the override for whoever audits it.', selector: '[data-tour="fp-amount"]' },
      { title: 'Review before releasing', body: 'Check each component - especially outstanding loans, since an unrecovered balance is difficult to collect once the person has left.' },
    ],
  },
  '/thirteenth-month': {
    key: 'thirteenth-month',
    label: '13th Month Pay',
    steps: [
      { title: 'Statutory 13th month', body: 'Philippine law requires 13th month pay for rank-and-file employees, computed as total basic salary earned during the year divided by 12.' },
      { title: 'Choose the year', body: 'Computation covers the calendar year. Employees who joined mid-year are pro-rated automatically from their hire date.' },
      { title: 'Compute the year', body: 'Calculates 13th month for every eligible employee from their basic salary earned that year. Re-running recalculates, so it is safe to compute again after fixing a payroll run.', selector: '[data-tour="tm-compute"]' },
      { title: 'Review before releasing', body: 'Check the basic-salary total per employee - this is a figure employees know and check, and it is reportable to BIR.' },
    ],
  },
  '/disbursement': {
    key: 'disbursement',
    label: 'Disbursement',
    steps: [
      { title: 'Paying people out', body: 'Sends the net pay from a locked payroll run to employee bank accounts via InstaPay or PESONet.' },
      { title: 'Top up first', body: 'Disbursement draws from this balance. Check it covers the whole run before starting - if it runs out mid-batch, some employees are paid and others are not, and you have to chase the remainder.', selector: '[data-tour="db-balance"]' },
      { title: 'Per-employee status', body: 'Every transfer is tracked individually - pending, processing, completed or failed - so a single failure is visible and can be retried without re-sending everyone.' },
      { title: 'Channel matters', body: 'InstaPay is real-time with a per-transaction cap; PESONet is same-day batch. The right channel depends on amount and urgency.' },
    ],
  },
  '/payroll/settings': {
    key: 'payroll-settings',
    label: 'Payroll Settings',
    steps: [
      { title: 'The rules payroll computes by', body: 'These settings apply to every run. Changing them changes what people are paid, so treat this page as configuration rather than something to experiment in.' },
      { title: 'Cutoff configuration', body: 'Defines your pay frequency and the day ranges for each cutoff. New payroll runs default their period from this, so getting it right here saves correcting every run.', selector: '[data-tour="ps-cycle"]' },
      { title: 'Overtime and premiums', body: 'Enable or disable overtime pay and set the multipliers for regular OT, rest day, holiday and night differential. Turning overtime off hides OT throughout timesheets as well.' },
      { title: 'Deduction toggles', body: 'Whether late and undertime are deducted, and how holiday pay is treated. These interact with per-employee overrides on the employee Settings tab - the employee-level switch wins.' },
      { title: 'Other income types', body: 'Define recurring allowances and extra income - commission, transport, meal. Each becomes assignable to employees and is picked up automatically on every run.', selector: '[data-tour="ps-income"]' },
      { title: 'Contributions', body: 'SSS, PhilHealth and Pag-IBIG tables. These drive statutory deductions and your government reports, so they should be updated when the agencies publish new schedules.' },
    ],
  },
  '/attendance/settings': {
    key: 'attendance-settings',
    label: 'Attendance Settings',
    steps: [
      { title: 'How clocking in works', body: 'Controls what employees must do to clock in, and what is captured when they do. It applies company-wide, with per-employee exemptions on the employee record.' },
      { title: 'Geofencing', body: 'Set the office coordinates and a radius in metres. Anyone outside it cannot clock in - so exempt field staff individually on their employee record rather than turning this off for everyone.', selector: '[data-tour="as-geofence"]' },
      { title: 'Selfie and screen capture', body: 'Optional proof-of-presence. Selfie captures at clock-in; screen capture samples periodically for desktop workers. Both are visible to the employee, and both have per-employee exemptions.', selector: '[data-tour="as-security"]' },
      { title: 'Auto clock-out', body: 'Closes a forgotten shift after a period of inactivity, so someone who forgets to clock out is not credited with an overnight shift and unearned overtime.' },
    ],
  },
  '/leaves/types': {
    key: 'leave-types',
    label: 'Leave Types',
    steps: [
      { title: 'Your leave categories', body: 'Define the kinds of leave your company grants - vacation, sick, emergency, and any statutory types - with the annual entitlement for each.' },
      { title: 'Name the leave type', body: 'What employees pick from when filing - use the name your policy uses, since this appears on their request form and balance.', selector: '[data-tour="lt-name"]' },
      { title: 'Entitlement and balance', body: 'The days set here become each employee default balance. Individual employees can be given a different entitlement on their record, which overrides this.' },
      { title: 'Description', body: 'Explains when this leave applies. Employees see it while filing, which cuts down on the wrong type being used.', selector: '[data-tour="lt-desc"]' },
      { title: 'Paid or unpaid', body: 'Whether a leave type is paid decides if payroll pays for those days or treats them as absences - so this flag has a direct effect on take-home pay.' },
    ],
  },
  '/leaves/calendar': {
    key: 'leave-calendar',
    label: 'Team Calendar',
    steps: [
      { title: 'Who is away, when', body: 'Approved leave laid out across the month so you can see coverage gaps before approving the next request.' },
      { title: 'Only approved leave', body: 'Pending requests do not appear here - approve them first and they show up. That keeps the calendar a statement of fact rather than of intent.' },
    ],
  },
  '/attendance/map': {
    key: 'gps-map',
    label: 'Live GPS Map',
    steps: [
      { title: 'Where people clocked in', body: 'Plots clock-in locations for staff whose attendance captures GPS - useful for field and site-based teams.' },
      { title: 'Requires location capture', body: 'Pins only appear for employees clocking in from a device that shares location and who are not exempt from geofencing. An empty map usually means capture is off, not that nobody clocked in.' },
    ],
  },
  '/biometric-devices': {
    key: 'biometric',
    label: 'Biometric Terminals',
    steps: [
      { title: 'Fingerprint terminals', body: 'Register physical biometric devices so clock events flow straight into timesheets without anyone using a phone or browser.' },
      { title: 'Coming soon', body: 'This module is not enabled yet. Employees can clock in from the portal, the desktop app, or a supervisor can add entries manually in the meantime.' },
    ],
  },
  '/reports/sss': {
    key: 'reports',
    label: 'Government Reports',
    steps: [
      { title: 'Statutory filings', body: 'SSS R3, PhilHealth RF-1, Pag-IBIG MCRF and BIR forms, generated from payroll data rather than typed up separately.' },
      { title: 'Pick the period', body: 'Reports cover a payroll period or month. Only locked and released runs are included, so finish your payroll before filing.' },
      { title: 'Export', body: 'Download in the format each agency expects. If a figure looks wrong, correct the underlying payroll run and regenerate - do not edit the export.' },
    ],
  },
  '/payroll/new': {
    key: 'payroll-new',
    label: 'New Payroll Run',
    steps: [
      { title: 'Creating a payroll run', body: 'A run is one pay cycle for a set of employees. You define the period, pick who is included, then compute - nothing is paid until you review, lock and release it, so it is safe to create one and look.' },
      { title: 'Period Start', body: 'First day of the cutoff being paid. Attendance, overtime and leave inside this range is what gets computed - so it must match the cutoff your company actually runs, not the pay date.', selector: '[data-tour="pr-period-start"]' },
      { title: 'Period End', body: 'Last day of the cutoff, inclusive. Timesheets should be approved up to this date before you compute, otherwise unapproved days are excluded and people are underpaid.', selector: '[data-tour="pr-period-end"]' },
      { title: 'Pay Frequency', body: 'Semi-monthly, monthly or weekly. This drives how contributions and withholding tax are divided across the year - a monthly run divides by 12, semi-monthly by 24 - so it must match how you actually pay.', selector: '[data-tour="pr-frequency"]' },
      { title: 'Pay Date', body: 'When the money actually reaches employees. It is the date printed on payslips and the one used for BIR reporting, and it can fall after the period ends.', selector: '[data-tour="pr-pay-date"]' },
      { title: 'Pay Group', body: 'Optional label for running more than one payroll over the same dates - for example probationary staff separately from regulars, or a project-based batch. Leave it blank for a normal company-wide run.', selector: '[data-tour="pr-pay-group"]' },
      { title: 'Notes', body: 'Free text kept on the run for whoever reviews or audits it later - for example why a special adjustment was included.', selector: '[data-tour="pr-notes"]' },
      { title: 'Employment types', body: 'Tick which employment types to include. This is the fastest way to scope a run - for example regulars only, or contractual staff paid on a different cycle.', selector: '[data-tour="pr-emp-types"]' },
      { title: 'Pick the employees', body: 'Search and tick individuals to fine-tune the list after the type filter. Anyone not selected is simply not in this run and can be paid in another one.', selector: '[data-tour="pr-emp-search"]' },
      { title: 'Create the run', body: 'This creates the run but does NOT pay anyone. If any timesheets in the period are still unapproved you will be warned first, because unapproved days are excluded from the computation.', selector: '[data-tour="pr-submit"]' },
      { title: 'What happens next', body: 'After creating: Compute to generate payslips, review them, then Lock to freeze the figures and Release to publish to employees. Disbursement pays them out. Each step is reversible until you lock.' },
    ],
  },
  '/tasks': {
    key: 'tasks',
    label: 'Tasks',
    steps: [
      { title: 'Task management, built in', body: 'A full task manager inside your HR system. Tasks are assigned to real employee records, so workload and logged time tie back to the people you already manage. There are no projects to set up — just create a task.' },
      { title: 'Create a task', body: 'Let us open the form and go through it field by field. Only the title is required - everything else can be added later from the task itself.', click: '[data-tour="task-new"]', selector: '[data-tour="task-new"]' },
      { title: 'Title', body: 'What actually needs doing, written so someone else can act on it without asking. This is the only required field and it becomes the task name everywhere - board card, list row, notifications.', selector: '#task-title' },
      { title: 'Due date', body: 'Drives everything time-based: overdue highlighting, the due-this-week count on your dashboard, and where the task lands in Calendar view. Leave it blank for work with no deadline - it simply never shows as late.', selector: '#task-due' },
      { title: 'Priority', body: 'Urgent, High, Medium or Low. Purely for sorting and scanning - it does not change dates or notifications, it tells your team what to pick up first.', selector: '#task-priority' },
      { title: 'Status', body: 'Which column the task starts in. Statuses are yours to define, and the one you mark as Done is what stamps a completion date and stops the task counting as overdue.', selector: '#task-status' },
      { title: 'Assignees', body: 'Search and add real employees - tasks attach to HR records, not free-text names. Everyone added gets a notification, can filter the board to their own queue, and can log hours against the task.', selector: '[data-tour="task-assignees"]' },
      { title: 'Notes', body: 'The context that stops people asking questions: links, acceptance criteria, background. It becomes the task description and is fully editable afterwards.', selector: '#task-notes' },
      { title: 'Attachments', body: 'Attach files up to 20 MB each. They upload after the task is created - if one fails you are told which, and the task is still saved rather than thrown away.', selector: '[data-tour="task-attachments"]' },
      // This step's `click` closes the dialog. Without it the modal stays open
      // over the view-switcher steps below, hiding the very thing they
      // describe - and the tour's own clicks would land on the overlay.
      { title: 'Create or discard', body: 'Create task saves it and drops it straight onto the board. Cancel discards everything - nothing is saved until you create. We will close the form now and look at the views.', click: '[data-tour="task-cancel"]', selector: '[data-tour="task-new"]' },
      { title: 'Board view', body: 'Drag a card between statuses to move the work along. Dropping into a status marked Done stamps a completion date and stops it counting as overdue.', click: '[data-tour-view="board"]', selector: '[data-tour-view="board"]' },
      { title: 'List view', body: 'The same tasks as compact rows grouped by status — denser than the board when you are scanning rather than moving things.', click: '[data-tour-view="list"]', selector: '[data-tour-view="list"]' },
      { title: 'Table view', body: 'Spreadsheet-style, with estimate against logged hours side by side. Useful when reviewing effort rather than progress.', click: '[data-tour-view="table"]', selector: '[data-tour-view="table"]' },
      { title: 'Calendar view', body: 'Everything with a due date laid out on a month grid, so you can see where the crunch weeks are.', click: '[data-tour-view="calendar"]', selector: '[data-tour-view="calendar"]' },
      { title: 'Filter to your own work', body: 'Pick yourself in the assignee filter to get just your queue — this replaced the separate My Work page.', selector: '[data-tour="task-assignee-filter"]' },
      { title: 'Make the board yours', body: 'Define the statuses your team actually uses, mark which one means Done, set work-in-progress limits, and manage labels.', selector: '[data-tour="task-statuses"]' },
    ],
  },
  '/timesheets': {
    key: 'timesheets',
    label: 'Timesheets',
    steps: [
      { title: 'Attendance in one place', body: 'Timesheets and employee-filed Corrections are tabs here. Overtime is no longer separate — it is approved as part of the timesheet it belongs to.' },
      { title: 'Review the hours', body: 'Daily, weekly or monthly view of clock in/out, regular hours, late, undertime and overtime. Approved time is what payroll computes from, so review before running payroll.', click: '[data-tour-tab="timesheets"]', selector: '[data-tour-tab="timesheets"]' },
      { title: 'Approving overtime', body: 'When you approve a timesheet that has overtime, you are asked whether to include it — and you can tick exactly which overtime rows to approve. Approve All is disabled when nothing is pending.' },
      { title: 'Daily, weekly or monthly', body: 'Switch the grouping of the grid. Weekly is the usual review rhythm because approval happens per employee-week; Daily is for chasing one specific date.', selector: '[data-tour="dtr-view-mode"]' },
      { title: 'Corrections', body: 'Employees file these when they miss a punch. Approving one updates the underlying time record, which then flows into payroll.', click: '[data-tour-tab="corrections"]', selector: '[data-tour-tab="corrections"]' },
      { title: 'Corrections status tabs', body: 'Pending is your queue. Approved and Rejected are the audit trail - every decision stays visible with who made it, so nothing disappears once actioned.', click: '[data-tour-tab="corrections"]', selector: '[data-tour="corr-status-tabs"]' },
    ],
  },
  '/organization': {
    key: 'organization',
    label: 'Organization',
    steps: [
      { title: 'Your company structure', body: 'Departments, Positions and the Org Chart are three views of one structure, so they live together as tabs.' },
      { title: 'Departments', body: 'Group people for payroll, reporting and approval routing. A department head can be given approval rights over their own team.', click: '[data-tour-tab="departments"]', selector: '[data-tour-tab="departments"]' },
      { title: 'Positions', body: 'Job titles assigned to employees. These appear on payslips, the org chart and statutory reports.', click: '[data-tour-tab="positions"]', selector: '[data-tour-tab="positions"]' },
      { title: 'Org Chart', body: 'Reporting lines drawn from each employee Reports To field — set that on the employee record and the chart builds itself.', click: '[data-tour-tab="org-chart"]', selector: '[data-tour-tab="org-chart"]' },
    ],
  },
  '/recruitment': {
    key: 'recruitment',
    label: 'Recruitment',
    steps: [
      { title: 'The employee lifecycle', body: 'Hiring, Onboarding and Offboarding follow one person through one journey, so they are tabs on a single page.' },
      { title: 'Hiring', body: 'Post jobs, collect applicants, move them through stages, and hire — hiring an applicant creates their employee record.', click: '[data-tour-tab="hiring"]', selector: '[data-tour-tab="hiring"]' },
      { title: 'Onboarding', body: 'Checklists for new hires, from pre-boarding to the 90-day mark.', click: '[data-tour-tab="onboarding"]', selector: '[data-tour-tab="onboarding"]' },
      { title: 'Active vs Templates', body: 'Active Onboardings tracks the people currently going through it. Templates is where you define the reusable programme - build it once and every new hire starts from it.', click: '[data-tour-tab="onboarding"]', selector: '[data-tour="onb-status-tabs"]' },
      { title: 'Offboarding status tabs', body: 'Filter exits by In Progress, Completed or Cancelled. A cancelled offboarding stays on record rather than being deleted, so a reversed resignation is still auditable.', click: '[data-tour-tab="offboarding"]', selector: '[data-tour="off-status-tabs"]' },
      { title: 'Offboarding', body: 'Exit clearance: asset return, final pay and sign-offs. Assets issued under Assets & Equipment show up here automatically.', click: '[data-tour-tab="offboarding"]', selector: '[data-tour-tab="offboarding"]' },
    ],
  },
  '/performance': {
    key: 'performance',
    label: 'Performance',
    steps: [
      { title: 'How your people are doing', body: 'Reviews, Disciplinary records and the Tardiness report together — the three things you look at when assessing someone.' },
      { title: 'Reviews', body: 'Scheduled performance reviews with scorecards. You can customise the competencies your company rates on.', click: '[data-tour-tab="reviews"]', selector: '[data-tour-tab="reviews"]' },
      { title: 'Disciplinary', body: 'Log incidents, warnings and sanctions against an employee record, with dates and attachments.', click: '[data-tour-tab="disciplinary"]', selector: '[data-tour-tab="disciplinary"]' },
      { title: 'Tardiness', body: 'Late arrivals, absences and undertime over any period — the objective attendance evidence behind a review or a warning.', click: '[data-tour-tab="tardiness"]', selector: '[data-tour-tab="tardiness"]' },
    ],
  },
  '/schedules': {
    key: 'schedules',
    label: 'Schedules',
    steps: [
      { title: 'When people are expected to work', body: 'Work Schedules and the Holiday Calendar as tabs — holidays are the exceptions to the shift pattern, so they belong together.' },
      { title: 'Work Schedules', body: 'Assign shifts and rest days per employee. This drives expected hours, and therefore late and undertime calculations.', click: '[data-tour-tab="shifts"]', selector: '[data-tour-tab="shifts"]' },
      { title: 'Holidays', body: 'Philippine regular and special non-working days. These drive holiday premium pay in payroll — sync them once a year.', click: '[data-tour-tab="holidays"]', selector: '[data-tour-tab="holidays"]' },
    ],
  },
  '/loans': {
    key: 'loans',
    label: 'Loans & Cash Advance',
    steps: [
      { title: 'Loans and advances', body: 'A cash advance becomes a loan once approved, and both deduct automatically through payslips — so they are two tabs, not two pages.' },
      { title: 'Loans', body: 'Company loans and government loans (SSS, Pag-IBIG) with amortisation schedules that payroll deducts against.', click: '[data-tour-tab="loans"]', selector: '[data-tour-tab="loans"]' },
      { title: 'Cash Advances', body: 'Employee requests for an advance. Approving one creates the matching loan and its deduction schedule.', click: '[data-tour-tab="cash-advance"]', selector: '[data-tour-tab="cash-advance"]' },
      { title: 'Filter by status', body: 'Opens on Pending - the requests waiting on you. Approved shows what is now deducting through payroll, and All includes rejected and cancelled requests for reference.', click: '[data-tour-tab="cash-advance"]', selector: '[data-tour="ca-status-tabs"]' },
    ],
  },
  '/employees/[id]': {
    key: 'employee-profile',
    label: 'Employee Profile',
    steps: [
      { title: 'The employee record', body: 'Everything about one person lives here, split across tabs. Anything you change flows through to payroll, attendance and statutory reports, so this is the single source of truth for that employee.' },
      { title: 'Personal', body: 'Identity and contact details, plus government IDs (SSS, PhilHealth, Pag-IBIG, TIN). The government numbers feed contribution calculations and your statutory filings, so a missing one shows up as a gap in reports.', click: '[data-tour-emp="personal"]', selector: '[data-tour-emp="personal"]' },
      { title: 'Employment', body: 'Department, position, hire date, employment status and type, plus the work schedule. The schedule is what defines expected hours, so it drives late, undertime and overtime on every timesheet.', click: '[data-tour-emp="employment"]', selector: '[data-tour-emp="employment"]' },
      { title: 'Compensation', body: 'Rate type (monthly, daily or hourly) and basic salary; daily and hourly rates derive from it. Allowances and recurring deductions set here are applied automatically on every payroll run.', click: '[data-tour-emp="compensation"]', selector: '[data-tour-emp="compensation"]' },
      { title: 'Leaves', body: 'Running balance per leave type and the full request history. Balances here are what the approval screen checks against when someone files leave.', click: '[data-tour-emp="leaves"]', selector: '[data-tour-emp="leaves"]' },
      { title: 'Payslips', body: 'Every payslip issued to this employee, with the earnings and deductions breakdown behind each one.', click: '[data-tour-emp="payslips"]', selector: '[data-tour-emp="payslips"]' },
      { title: 'Loans', body: 'Company and government loans plus cash advances, with their amortisation schedules. Outstanding balances deduct automatically through payroll.', click: '[data-tour-emp="loans"]', selector: '[data-tour-emp="loans"]' },
      { title: 'Settings', body: 'Per-employee switches: which contributions apply, whether holiday pay and late or undertime deductions are taken, and Track Time. Track Time is the important one - it decides whether this person is paid from their DTR, and overtime only applies when it is on.', click: '[data-tour-emp="settings"]', selector: '[data-tour-emp="settings"]' },
      { title: 'Documents', body: 'The employee 201 file: contracts, IDs and certificates. Documents with expiry dates raise a reminder before they lapse.', click: '[data-tour-emp="documents"]', selector: '[data-tour-emp="documents"]' },
    ],
  },
  '/employees': {
    key: 'employees',
    label: 'Employees',
    steps: [
      { title: 'Your employee directory', body: 'This is the master list of everyone in your company. From here you can view profiles, edit details, manage portal access, and run payroll on these records.' },
      { title: 'Add an employee', body: 'Click here to create a single employee. You\'ll fill in their personal, employment, compensation, and government details.', selector: '[data-tour="add-employee"]' },
      { title: 'Bulk import', body: 'Have many employees? Download the template, fill it in, and import them all at once instead of adding one by one.', selector: '[data-tour="import-employees"]' },
      { title: 'Search & open', body: 'Search by name or employee number, then click a row to open the full profile.', selector: '[data-tour="employee-search"]' },
      { title: 'Narrow the list', body: 'Filter by department or employment status - handy before a payroll run when you only want one department, or to find everyone still on probation.', selector: '[data-tour="employee-filters"]' },
      { title: 'Row actions', body: 'View opens the full profile. Delete is a soft delete: the person disappears from this list but their payslips and history are kept, because payroll records have to be retained.', selector: '[data-tour="employee-actions"]' },
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
  '/payroll': {
    key: 'payroll',
    label: 'Payroll',
    steps: [
      { title: 'Payroll runs', body: 'Every pay cycle you have created, newest first, with its status - draft, computed, locked or released.' },
      { title: 'Start a new run', body: 'Opens the setup form where you pick the period, pay date and who is included. Creating a run does not pay anyone - you compute, review, lock and release afterwards.', selector: '[data-tour="payroll-new"]' },
      { title: 'Review → Approve → Lock', body: 'Open the run to review each payslip. Submit for approval, approve through your workflow, then lock to finalize and release payslips.' },
      { title: 'Tip', body: 'Make sure time sheets and overtime are approved before computing — the system flags anything pending so totals stay accurate.' },
    ],
  },
  '/leaves': {
    key: 'leaves',
    label: 'Leave Requests',
    steps: [
      { title: 'Leave requests', body: 'Every submitted application lands here. Approving follows the chain configured under Settings, Approval Workflows - so a request may advance to a second approver rather than being finalised by you.' },
      { title: 'File on behalf', body: 'File a leave request for someone who cannot do it themselves - it still runs through the same approval chain.', selector: '[data-tour="leave-file"]' },
      { title: 'Balances & types', body: 'Each request shows the employee\'s running balance. Configure leave categories and entitlements under Leave Types.' },
    ],
  },
  '/settings': {
    key: 'settings',
    label: 'Settings',
    steps: [
      { title: 'Company settings', body: 'Set your company name, address, TIN, and logo — these appear on payslips, invoices, and statutory reports.' },
      { title: 'More tabs', body: 'Use the tabs for Government IDs, Email, User Management, Role Permissions, Approval Workflows, and Billing.', selector: '[data-tour="settings-tabs"]' },
    ],
  },
}

/** Resolve the tour for a pathname (exact match, then known nested routes). */
export function resolvePageTour(pathname: string): PageTour | null {
  if (TOURS[pathname]) return TOURS[pathname]

  // Dynamic segments. An employee profile is /employees/<cuid>, which can
  // never match a literal key, so map it onto the '[id]' entry. '/new' is
  // excluded because it has its own dedicated form tour above.
  if (/^\/employees\/[^/]+$/.test(pathname) && !pathname.endsWith('/new')) {
    return TOURS['/employees/[id]'] ?? null
  }

  // All four government report pages explain the same workflow, so they
  // share one tour rather than repeating it four times.
  if (pathname.startsWith('/reports/')) return TOURS['/reports/sss'] ?? null

  return null
}
