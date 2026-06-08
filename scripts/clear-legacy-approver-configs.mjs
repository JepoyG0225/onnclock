// One-off migration: delete legacy ApproverConfig rows for every
// (companyId, type) pair where an active ApprovalWorkflow with at
// least one APPROVAL step exists. After this, the two systems can no
// longer drift (the legacy fallback would simply find no rows and the
// new workflow path takes over).
//
// Run with:
//   node --env-file=.env.local scripts/clear-legacy-approver-configs.mjs --dry-run
//   node --env-file=.env.local scripts/clear-legacy-approver-configs.mjs --apply

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const DRY   = !APPLY

// Map workflow.type → ApproverConfig.type strings. ApproverConfig only
// ever stored 'PAYROLL' and 'LEAVE' (per the model comment), so we ignore
// workflow types that have no legacy counterpart.
const LEGACY_TYPE_MAP = { PAYROLL: 'PAYROLL', LEAVE: 'LEAVE' }

const workflows = await prisma.approvalWorkflow.findMany({
  where: {
    isActive: true,
    type: { in: Object.keys(LEGACY_TYPE_MAP) },
  },
  include: {
    steps: { select: { stepType: true } },
    company: { select: { name: true } },
  },
})

// Group by (companyId, legacyType) — only delete when the active workflow
// has at least one APPROVAL step. A notify-only workflow shouldn't wipe
// the legacy chain because the engine would treat noChain=true and the
// caller still needs the legacy gate as the source of truth.
const targets = new Map()
for (const wf of workflows) {
  const legacyType = LEGACY_TYPE_MAP[wf.type]
  if (!legacyType) continue
  const hasApprovalStep = wf.steps.some(s => s.stepType === 'APPROVAL')
  if (!hasApprovalStep) continue
  const key = `${wf.companyId}:${legacyType}`
  if (!targets.has(key)) {
    targets.set(key, { companyId: wf.companyId, companyName: wf.company?.name, legacyType })
  }
}

console.log(`Found ${targets.size} (company, type) pair${targets.size === 1 ? '' : 's'} with active workflow.\n`)

let totalToDelete = 0
for (const t of targets.values()) {
  const rows = await prisma.approverConfig.findMany({
    where: { companyId: t.companyId, type: t.legacyType },
    include: { user: { select: { name: true, email: true } } },
  })
  if (rows.length === 0) continue
  totalToDelete += rows.length
  console.log(`${t.companyName} — ${t.legacyType}: ${rows.length} legacy row${rows.length === 1 ? '' : 's'} to delete`)
  for (const r of rows) {
    console.log(`  L${r.level}: ${r.user?.name ?? '?'} (${r.user?.email ?? '-'})`)
  }
  console.log()
}

if (totalToDelete === 0) {
  console.log('Nothing to clear — every workflow-covered company is already clean.')
  process.exit(0)
}

if (DRY) {
  console.log(`\nDRY-RUN: would delete ${totalToDelete} row${totalToDelete === 1 ? '' : 's'}. Re-run with --apply to commit.`)
  process.exit(0)
}

let deleted = 0
for (const t of targets.values()) {
  const res = await prisma.approverConfig.deleteMany({
    where: { companyId: t.companyId, type: t.legacyType },
  })
  deleted += res.count
  console.log(`✓ ${t.companyName} — ${t.legacyType}: deleted ${res.count}`)
}
console.log(`\nDone. Deleted ${deleted} legacy ApproverConfig row${deleted === 1 ? '' : 's'}.`)
process.exit(0)
