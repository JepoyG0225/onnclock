import type { Permission } from '@/lib/auth/permissions'
export type SetupStep = { id: string; module: string; title: string; description: string; href: string; permission: Permission; automatic: string | null; pro: boolean }
export const SETUP_STEPS: SetupStep[] = [
  {
    "id": "company",
    "module": "Company & access",
    "title": "Complete your company profile",
    "description": "Add your address, contact email and company details.",
    "href": "/settings",
    "permission": "settings:read",
    "automatic": "profile",
    "pro": false
  },
  {
    "id": "roles",
    "module": "Company & access",
    "title": "Review roles and permissions",
    "description": "Choose what each administrator can view or change.",
    "href": "/settings/permissions",
    "permission": "users:manage",
    "automatic": null,
    "pro": false
  },
  {
    "id": "approvers",
    "module": "Company & access",
    "title": "Set request approvers",
    "description": "Assign approvers for leave, cash advances, expenses and attendance.",
    "href": "/settings/approvals",
    "permission": "settings:write",
    "automatic": null,
    "pro": false
  },
  {
    "id": "department",
    "module": "Organization",
    "title": "Create your first department",
    "description": "Open Departments, select Add, enter a name and save.",
    "href": "/organization",
    "permission": "departments:write",
    "automatic": "department",
    "pro": false
  },
  {
    "id": "position",
    "module": "Organization",
    "title": "Create your first position",
    "description": "Open Positions in Organization and add a job title.",
    "href": "/organization?tab=positions",
    "permission": "departments:write",
    "automatic": "position",
    "pro": false
  },
  {
    "id": "employee",
    "module": "Employees",
    "title": "Add your first employee",
    "description": "Enter personal, employment and compensation details, then save.",
    "href": "/employees/new",
    "permission": "employees:write",
    "automatic": "employee",
    "pro": false
  },
  {
    "id": "portal",
    "module": "Employees",
    "title": "Enable employee portal access",
    "description": "Open an employee profile and configure Portal Access.",
    "href": "/employees",
    "permission": "employees:write",
    "automatic": "portal",
    "pro": false
  },
  {
    "id": "schedule",
    "module": "Attendance",
    "title": "Create a work schedule",
    "description": "Set work hours, timezone, break duration and working days.",
    "href": "/schedules",
    "permission": "settings:read",
    "automatic": "schedule",
    "pro": false
  },
  {
    "id": "assign",
    "module": "Attendance",
    "title": "Assign an employee schedule",
    "description": "Edit an employee and select the schedule in Employment.",
    "href": "/employees",
    "permission": "employees:write",
    "automatic": "assignment",
    "pro": false
  },
  {
    "id": "attendance",
    "module": "Attendance",
    "title": "Review attendance rules",
    "description": "Choose your location, selfie and clocking rules before employees start.",
    "href": "/attendance/settings",
    "permission": "settings:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "timesheets",
    "module": "Attendance",
    "title": "Review timesheets and approval flow",
    "description": "Learn where to review completed sessions and approve attendance.",
    "href": "/timesheets",
    "permission": "dtr:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "attendance-reports",
    "module": "Attendance",
    "title": "Explore attendance reports",
    "description": "Choose an employee and period to report attendance and daily activities.",
    "href": "/attendance/reports",
    "permission": "dtr:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "holidays",
    "module": "Attendance",
    "title": "Review the holiday calendar",
    "description": "Confirm holidays applicable to your company and employee eligibility.",
    "href": "/holidays",
    "permission": "settings:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "leave-types",
    "module": "Leave management",
    "title": "Review leave types",
    "description": "Check entitlements, paid or unpaid treatment and cash conversion rules.",
    "href": "/leaves/types",
    "permission": "settings:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "leave-credits",
    "module": "Leave management",
    "title": "Allocate employee leave credits",
    "description": "Open employee Leaves or Leave Credits and assign the applicable balances.",
    "href": "/leaves/credits",
    "permission": "leaves:read",
    "automatic": "leaveBalance",
    "pro": false
  },
  {
    "id": "leave-requests",
    "module": "Leave management",
    "title": "Review leave approvals",
    "description": "Check the request workflow and team calendar before approving leave.",
    "href": "/leaves",
    "permission": "leaves:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "encashment",
    "module": "Leave management",
    "title": "Review leave encashment",
    "description": "Check which leave types are convertible and how approved conversions enter payroll.",
    "href": "/leaves/encashments",
    "permission": "leaves:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "payroll-settings",
    "module": "Payroll & finance",
    "title": "Review payroll settings",
    "description": "Confirm pay periods, contribution schedules and payroll rules.",
    "href": "/payroll/settings",
    "permission": "payroll:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "payroll",
    "module": "Payroll & finance",
    "title": "Prepare your first payroll draft",
    "description": "Select a period and employees, compute, then review the breakdown before finalizing.",
    "href": "/payroll",
    "permission": "payroll:read",
    "automatic": "payroll",
    "pro": false
  },
  {
    "id": "loans",
    "module": "Payroll & finance",
    "title": "Review loans and cash advances",
    "description": "Learn how to record a loan, set repayments and approve requests.",
    "href": "/loans",
    "permission": "loans:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "budget",
    "module": "Payroll & finance",
    "title": "Review budget requisitions",
    "description": "Check how budgets are requested, reviewed and approved.",
    "href": "/budget-requisitions",
    "permission": "budget:read",
    "automatic": null,
    "pro": true
  },
  {
    "id": "expenses",
    "module": "Payroll & finance",
    "title": "Set up expense reimbursement",
    "description": "Review expense types, receipts, approvals and bank or cash reimbursement tracking.",
    "href": "/expenses",
    "permission": "expenses:read",
    "automatic": null,
    "pro": true
  },
  {
    "id": "benefits",
    "module": "Payroll & finance",
    "title": "Review Benefits & HMO",
    "description": "Choose the benefit plans and employee enrollments your company needs.",
    "href": "/benefits",
    "permission": "benefits:manage",
    "automatic": null,
    "pro": true
  },
  {
    "id": "year-end",
    "module": "Payroll & finance",
    "title": "Review 13th month and final pay",
    "description": "Check year-end and separation calculations before your first payout.",
    "href": "/thirteenth-month",
    "permission": "payroll:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "payslip",
    "module": "Payroll & finance",
    "title": "Customize your payslip design",
    "description": "Choose company colors, header, footer and deduction visibility.",
    "href": "/payroll/settings",
    "permission": "payroll:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "final-pay",
    "module": "Payroll & finance",
    "title": "Review final pay",
    "description": "Locate the final-pay workflow for employees who leave the company.",
    "href": "/final-pay",
    "permission": "payroll:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "reconciliation",
    "module": "Payroll & finance",
    "title": "Review payroll reconciliation",
    "description": "Compare computed payroll totals and resolve discrepancies before finalizing.",
    "href": "/payroll/reconciliation",
    "permission": "payroll:read",
    "automatic": null,
    "pro": false
  },
  {
    "id": "recruitment",
    "module": "People operations",
    "title": "Explore recruitment",
    "description": "Review job posts, applicant stages and onboarding options.",
    "href": "/recruitment",
    "permission": "recruitment:manage",
    "automatic": null,
    "pro": true
  },
  {
    "id": "performance",
    "module": "People operations",
    "title": "Review performance reviews",
    "description": "Choose your review periods, competencies and reviewers.",
    "href": "/performance",
    "permission": "performance:manage",
    "automatic": null,
    "pro": true
  },
  {
    "id": "onboarding",
    "module": "People operations",
    "title": "Review employee onboarding",
    "description": "Set the steps for new hires and assign onboarding responsibilities.",
    "href": "/onboarding",
    "permission": "onboarding:manage",
    "automatic": null,
    "pro": true
  },
  {
    "id": "offboarding",
    "module": "People operations",
    "title": "Review employee offboarding",
    "description": "Check clearance, document and equipment return workflows.",
    "href": "/offboarding",
    "permission": "offboarding:manage",
    "automatic": null,
    "pro": true
  },
  {
    "id": "helpdesk",
    "module": "Workspace",
    "title": "Explore HR Helpdesk",
    "description": "Review employee concerns and document requests in the shared queue.",
    "href": "/hr-requests",
    "permission": "hrrequests:manage",
    "automatic": null,
    "pro": false
  },
  {
    "id": "hr-center",
    "module": "Workspace",
    "title": "Review HR Center tools",
    "description": "Explore document templates, employee records and HR workflows.",
    "href": "/hr-center",
    "permission": "contracts:manage",
    "automatic": null,
    "pro": false
  },
  {
    "id": "tasks",
    "module": "Workspace",
    "title": "Create your first task",
    "description": "Add a task, assign an owner and set its due date.",
    "href": "/tasks",
    "permission": "tasks:read",
    "automatic": "task",
    "pro": false
  },
  {
    "id": "learning",
    "module": "Workspace",
    "title": "Explore learning and certifications",
    "description": "Review course creation, employee enrollment and certificate templates.",
    "href": "/learning",
    "permission": "learning:manage",
    "automatic": null,
    "pro": true
  },
  {
    "id": "announcements",
    "module": "Workspace",
    "title": "Publish your first announcement",
    "description": "Share a welcome message with your employees.",
    "href": "/announcements",
    "permission": "announcements:write",
    "automatic": "announcement",
    "pro": false
  },
  {
    "id": "assets",
    "module": "Workspace",
    "title": "Review asset tracking",
    "description": "Decide how to register equipment and record employee assignments.",
    "href": "/assets",
    "permission": "assets:manage",
    "automatic": null,
    "pro": true
  },
  {
    "id": "documents",
    "module": "HR Center",
    "title": "Review document templates",
    "description": "Prepare company document templates with your header and footer.",
    "href": "/hr-center",
    "permission": "documents:manage",
    "automatic": null,
    "pro": false
  },
  {
    "id": "compliance",
    "module": "HR Center",
    "title": "Review compliance tracking",
    "description": "Set up your compliance calendar and obligations.",
    "href": "/hr-center",
    "permission": "compliance:manage",
    "automatic": null,
    "pro": false
  },
  {
    "id": "salary",
    "module": "HR Center",
    "title": "Review salary changes",
    "description": "Review how salary changes are proposed and approved.",
    "href": "/hr-center",
    "permission": "salarychanges:manage",
    "automatic": null,
    "pro": false
  },
  {
    "id": "reports",
    "module": "Reports",
    "title": "Review government reports",
    "description": "Locate SSS, PhilHealth, Pag-IBIG and BIR reports for completed payrolls.",
    "href": "/reports/sss",
    "permission": "reports:generate",
    "automatic": null,
    "pro": false
  },
  {
    "id": "analytics",
    "module": "Reports",
    "title": "Explore HR analytics",
    "description": "Review headcount, attendance and payroll insights as records accumulate.",
    "href": "/analytics",
    "permission": "analytics:read",
    "automatic": null,
    "pro": true
  }
]
