# Main reconciliation - November 24, 2026

Reconciles the working OnClock release with GitHub main (363d796). Main was an ancestor of the working release branch; the reconciled snapshot preserves the later application features and includes the Time Corrections and Team Calendar updates.

Validation: fresh npm ci, Prisma client generation, TypeScript, and all 20 permission checks passed. The full suite ran 550 tests: 519 passed and 31 failed. The original working source has the identical 31 failing tests; no reconciliation-only failures were found. These existing failures remain outstanding.

Local environments, assistant credentials, sessions, recordings, build outputs, and scratch files are excluded. The previously tracked local assistant settings file is removed from the current tree (this does not erase Git history).

Use main as the release branch. Commit completed source changes and verify the Vercel production deployment after pushing; avoid deploying uncommitted application changes directly.
