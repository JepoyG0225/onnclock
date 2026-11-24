# Salary changes and workplace safety

Open Workspace > HR Center. Permissions are under Workspace in Roles & Permissions.

## Salary changes

Create a request for an active employee. The amount uses the current monthly/daily/hourly basis. A different user with Approve salary changes permission must approve; neither the requester nor the affected employee can self-approve. Approval stores the previous rate and an effective date. Existing approval dates cannot be overwritten or backfilled out of order. Rate-type conversions are not supported by this workflow.

Payroll prices basic units, approved overtime, night hours, holiday premiums, and late/undertime minutes by work date. Monthly pay keeps the company daily divisor; hourly pay keeps scheduled paid hours before deductions. Tax and contributions are computed once on combined earnings. Unreconciled dated inputs stop a changed-rate computation with an actionable review message.

Future rates update payroll on their effective date; the hourly HR reminder job refreshes current employee salary cards. Approved history blocks direct salary/rate-type edits through employee profiles. Editable computed payrolls at or after the effective date return to Draft and must be recomputed. Approved/locked payrolls retain their original amounts.

Review retroactive pay from an approved salary record. Exact dated snapshots are available for payrolls computed after this release when daily amounts reconcile. Reviewers schedule positive differences from locked source payrolls to a later editable payroll containing that employee. Basic differences enter basic pay and 13th-month accrual; net premium/attendance differences enter taxable earnings. Recompute the target before approval. Allocation is idempotent, with source payslip references. Unschedule first to change scope or delete the target. Unscheduling requires recomputation as well.

Legacy snapshots, manual overrides, missing dated input reconciliation, and negative recovery adjustments require separate payroll review; the system does not guess or silently recover wages. No existing salary or payroll is changed merely by deployment.

## Workplace safety

Record the incident date/time (Philippine time), location, optional affected employee, type, severity, injury, immediate response, witnesses, and workdays lost. Assign an owner and next review date. Investigation records root cause/findings; corrective actions each have an authorized owner, deadline, completion date, and effectiveness verification. Completion requires all actions verified and closure notes. Private evidence and all edits retain audit history.

The review date must be on or before the earliest pending action deadline. HR reminders notify authorized owners/managers. Export the full incident register by incident date range (CSV, maximum 10,000 records); private fields remain restricted to Workplace safety permission. The register supports preparation, not automatic DOLE filing. Use the linked official forms/reporting portal, then record the filing reference/date.

## Validation

Automated tests cover effective-date boundaries, hourly scheduled hours, monthly/daily proration, holiday/OT/late calculations, independent approvals, stale rates, duplicate retro scheduling, company scope, excluded employees, immutable/legacy source handling, safety closure, and formula-safe CSV export. No sample business records are inserted in production.
