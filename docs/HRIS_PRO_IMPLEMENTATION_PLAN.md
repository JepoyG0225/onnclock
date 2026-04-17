# Pro (Php 70/employee) - Implementation Blueprint

## Scope
- Recruitment with public job links and applicant pipeline.
- Company-configurable onboarding templates and tracker.
- Performance reviews with cycle periods and ratings.
- Dedicated document compliance console.

## Philippine HRIS Design Notes
- Preserve core statutory fields in employee profile/201 (TIN, SSS, PhilHealth, Pag-IBIG, emergency contacts, civil status).
- Keep 201 requirements configurable per company (e.g., NBI, PSA birth cert, diploma, pre-employment medical, government IDs).
- Track document expiry for ID renewals and compliance alerts.
- Support role separation for HR/Admin reviewers and auditable stage changes.

## Phase Plan
1. Phase 1 (this delivery)
- Add DB schema + migration for recruitment/onboarding/performance core tables.
- Add Pro access gate (`pricePerSeat >= 70`).
- Add recruitment admin APIs and public application endpoint via shareable token URL.
- Add dashboard pages for recruitment list, application stage updates, and public apply page.

2. Phase 2
- Add onboarding template CRUD (documents/videos/tasks/order/due-days).
- Add onboarding process board with assignees and completion SLA.
- Auto-create default templates per company for faster onboarding launch.

3. Phase 3
- Add performance cycle setup (quarterly/semi-annual/annual), competency scorecards, and acknowledgements.
- Add review calibration and final sign-off workflow.

4. Phase 4
- Add documents module UI (document checklist, expiry monitor, missing docs dashboard).
- Add export and audit report endpoints for compliance checks.

## Data/Access Rules
- Strict company scoping on all HRIS endpoints.
- Public apply endpoint only works for published jobs and active Pro companies.
- Stage transitions are auditable and update `lastStageUpdatedAt`.
- HIRED transition can auto-start onboarding process from default template.

## Recommended Next Tasks
- Build recruitment analytics widgets (time-to-hire, stage conversion, source effectiveness).
- Add file upload storage integration for resumes/supporting documents.
- Add notification hooks (email/in-app) for interview and onboarding actions.


