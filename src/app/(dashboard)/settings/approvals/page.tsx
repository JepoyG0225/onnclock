'use client'
import { useState, useEffect, useCallback, type ComponentType } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { CheckCircle, FileText, Users, Plus, Trash2, TimerReset, Clock3, ClipboardCheck, Workflow, ChevronDown, ChevronRight, UserCheck, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import NewFeatureBadge from '@/components/ui/NewFeatureBadge'

const LEVEL_LABELS: Record<number, string> = {
  1: '1st Approver',
  2: '2nd Approver',
  3: '3rd Approver',
  4: '4th Approver',
  5: '5th Approver',
}

function levelLabel(n: number) {
  return LEVEL_LABELS[n] ?? `${n}th Approver`
}

interface UserOption {
  userId: string
  name: string | null
  email: string | null
  role: string
}

interface ApproverEntry {
  type: ApprovalType
  level: number
  userId: string
}

type ApprovalType = 'PAYROLL' | 'LEAVE' | 'OVERTIME' | 'TIME_CORRECTION' | 'ATTENDANCE_REVIEW'

const WORKFLOW_META: Record<ApprovalType, { title: string; subtitle: string; icon: ComponentType<{ className?: string }>; steps: { label: string; desc: string; color: string }[] }> = {
  PAYROLL: {
    title: 'Payroll Approval Workflow',
    subtitle: 'Controls payroll submit → approve → lock flow.',
    icon: CheckCircle,
    steps: [
      { label: 'Draft', desc: 'Payroll run created', color: '#777777' },
      { label: 'For Approval', desc: 'Submitted by payroll team', color: '#f59e0b' },
      { label: 'Approved', desc: 'Multi-level approval finished', color: '#10b981' },
      { label: 'Locked', desc: 'Ready for release', color: '#8b5cf6' },
    ],
  },
  LEAVE: {
    title: 'Leave Request Workflow',
    subtitle: 'Approvers review and decide requests in sequence.',
    icon: FileText,
    steps: [
      { label: 'Filed', desc: 'Employee submits request', color: '#777777' },
      { label: 'Pending', desc: 'Awaiting approvers', color: '#f59e0b' },
      { label: 'Approved/Rejected', desc: 'Final action by approvers', color: '#10b981' },
    ],
  },
  OVERTIME: {
    title: 'Overtime Request Workflow',
    subtitle: 'Approval chain for overtime requests before payroll.',
    icon: Clock3,
    steps: [
      { label: 'Submitted', desc: 'Employee files overtime', color: '#777777' },
      { label: 'Review', desc: 'Approvers validate reason/hours', color: '#f59e0b' },
      { label: 'Approved', desc: 'Included in payroll run', color: '#10b981' },
    ],
  },
  TIME_CORRECTION: {
    title: 'Time Correction Workflow',
    subtitle: 'Manages DTR correction approvals and audit trace.',
    icon: TimerReset,
    steps: [
      { label: 'Requested', desc: 'Employee files correction', color: '#777777' },
      { label: 'Verification', desc: 'Approvers review records', color: '#f59e0b' },
      { label: 'Applied', desc: 'Approved changes reflected in DTR', color: '#10b981' },
    ],
  },
  ATTENDANCE_REVIEW: {
    title: 'Attendance Review Workflow',
    subtitle: 'Controls weekly attendance review approvals.',
    icon: ClipboardCheck,
    steps: [
      { label: 'Submitted', desc: 'Week sent for review', color: '#777777' },
      { label: 'Approval', desc: 'Approvers validate attendance', color: '#f59e0b' },
      { label: 'Finalized', desc: 'Ready for payroll', color: '#10b981' },
    ],
  },
}

function WorkflowSteps({ steps }: { steps: { label: string; desc: string; color: string }[] }) {
  return (
    <div className="flex items-start w-full">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-start flex-1 min-w-0">
          <div className="flex flex-col items-center flex-1 min-w-0 px-1">
            <div className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white text-center w-full" style={{ background: s.color }}>
              {s.label}
            </div>
            <span className="text-xs text-gray-400 mt-1.5 text-center leading-tight">{s.desc}</span>
          </div>
          {i < steps.length - 1 && (
            <span className="flex-shrink-0 text-gray-300 text-base mt-1.5 leading-none">→</span>
          )}
        </div>
      ))}
    </div>
  )
}

interface BuilderStep {
  stepType: string
  approverType?: string | null
  approverUserId?: string | null
  approverRole?: string | null
  notifyTarget?: string | null
  notifyRole?: string | null
  notifyChannel?: string | null
  messageTitle?: string | null
  conditions?: { match?: string; rules?: { field: string; op: string; value: string }[] } | null
}
interface BuilderWorkflow {
  id: string
  type: string
  name: string
  departmentId: string | null
  isActive: boolean
  steps: BuilderStep[]
}
interface BuilderDept { id: string; name: string }
interface BuilderUser { userId: string; name: string | null; email: string | null }

const OP_LABELS: Record<string, string> = {
  eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'in', contains: 'contains',
}

function describeStep(step: BuilderStep, users: BuilderUser[]): string {
  const userName = (id?: string | null) => {
    const u = users.find(x => x.userId === id)
    return u ? (u.name ?? u.email ?? 'user') : 'user'
  }
  if (step.stepType === 'APPROVAL') {
    if (step.approverType === 'DEPARTMENT_HEAD') return 'Reports To (requester’s manager)'
    if (step.approverType === 'ROLE') return `Anyone with role: ${step.approverRole ?? '—'}`
    return `Approver: ${userName(step.approverUserId)}`
  }
  // NOTIFY
  const target = step.notifyTarget === 'SPECIFIC_USER' ? userName(step.approverUserId ?? step.notifyRole)
    : step.notifyTarget === 'ROLE' ? `role ${step.notifyRole ?? '—'}`
    : step.notifyTarget === 'DEPARTMENT_HEAD' ? 'reports-to manager'
    : 'requester'
  const channel = step.notifyChannel === 'BOTH' ? 'in-app + email' : step.notifyChannel === 'EMAIL' ? 'email' : 'in-app'
  return `Notify ${target} (${channel})`
}

function describeConditions(step: BuilderStep): string | null {
  const rules = step.conditions?.rules
  if (!rules || rules.length === 0) return null
  const match = (step.conditions?.match ?? 'ALL') === 'ANY' ? ' OR ' : ' AND '
  return rules.map(r => `${r.field} ${OP_LABELS[r.op] ?? r.op} ${r.value}`).join(match)
}

// Shared collapsible card used for BOTH legacy and builder workflows so they
// share one consistent, collapsible UI.
function CollapsibleCard({ open, onToggle, icon, title, count, subtitle, headerRight, children }: {
  open: boolean
  onToggle: () => void
  icon?: React.ReactNode
  title: React.ReactNode
  count?: React.ReactNode
  subtitle?: React.ReactNode
  headerRight?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 shadow-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
      >
        <span className="mt-0.5 text-slate-400 shrink-0">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{title}</span>
            {count != null && <span className="text-xs font-normal text-gray-400">{count}</span>}
          </div>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {headerRight && <span onClick={e => e.stopPropagation()} className="shrink-0">{headerRight}</span>}
      </div>
      {open && <div className="border-t border-slate-100 p-4">{children}</div>}
    </div>
  )
}

const BUILDER_TYPE_LABELS: Record<string, string> = {
  PAYROLL: 'Payroll',
  LEAVE: 'Leave',
  OVERTIME: 'Overtime',
  CASH_ADVANCE: 'Cash Advance',
  BUDGET: 'Budget Requisition',
  TIME_CORRECTION: 'Time Correction',
  ATTENDANCE_REVIEW: 'Attendance Review',
}

export default function ApprovalWorkflowsPage() {
  const [users, setUsers] = useState<UserOption[]>([])
  const [approvers, setApprovers] = useState<ApproverEntry[]>([])
  const [builderWorkflows, setBuilderWorkflows] = useState<BuilderWorkflow[]>([])
  const [builderDepts, setBuilderDepts] = useState<BuilderDept[]>([])
  const [builderUsers, setBuilderUsers] = useState<BuilderUser[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [res, wfRes] = await Promise.all([
      fetch('/api/settings/approvers'),
      fetch('/api/settings/workflows').catch(() => null),
    ])
    const data = await res.json().catch(() => ({}))
    setUsers(data.users ?? [])
    setApprovers(data.approvers ?? [])
    if (wfRes && wfRes.ok) {
      const wfData = await wfRes.json().catch(() => ({}))
      setBuilderWorkflows(wfData.workflows ?? [])
      setBuilderDepts(wfData.departments ?? [])
      setBuilderUsers(wfData.users ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  // A legacy section is "switched" once a company-default builder workflow
  // exists for the same type — at that point the engine governs it and we hide
  // the legacy card to avoid showing two configs for one flow.
  function hasBuilderFor(type: ApprovalType): boolean {
    return builderWorkflows.some(w => w.type === type && !w.departmentId)
  }

  // Legacy types not yet switched to a builder workflow (even with 0 approvers —
  // they convert into an empty, editable builder card).
  const convertibleTypes = (['PAYROLL', 'LEAVE', 'OVERTIME', 'TIME_CORRECTION', 'ATTENDANCE_REVIEW'] as ApprovalType[])
    .filter(t => !hasBuilderFor(t))

  async function switchToBuilder() {
    setImporting(true)
    try {
      const res = await fetch('/api/settings/workflows/import-legacy', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Import failed')
      const n = data.imported ?? 0
      toast.success(n > 0 ? `Switched ${n} workflow${n !== 1 ? 's' : ''} to the builder` : 'Already up to date')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to switch workflows')
    } finally {
      setImporting(false)
    }
  }

  function getApproversFor(type: ApprovalType): ApproverEntry[] {
    return approvers.filter(a => a.type === type).sort((a, b) => a.level - b.level)
  }

  function nextLevel(type: ApprovalType): number {
    const levels = getApproversFor(type).map(a => a.level)
    return levels.length === 0 ? 1 : Math.max(...levels) + 1
  }

  async function setApprover(type: ApprovalType, level: number, userId: string) {
    const key = `${type}-${level}`
    setSaving(key)
    try {
      const res = await fetch('/api/settings/approvers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type, level }),
      })
      if (!res.ok) throw new Error()
      setApprovers(prev => {
        const filtered = prev.filter(a => !(a.type === type && a.level === level))
        return [...filtered, { type, level, userId }]
      })
      toast.success('Approver updated')
    } catch {
      toast.error('Failed to update approver')
    } finally {
      setSaving(null)
    }
  }

  async function removeLevel(type: ApprovalType, level: number) {
    const key = `${type}-${level}-del`
    setSaving(key)
    try {
      const res = await fetch('/api/settings/approvers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, level }),
      })
      if (!res.ok) throw new Error()
      setApprovers(prev => prev.filter(a => !(a.type === type && a.level === level)))
      toast.success('Approver level removed')
    } catch {
      toast.error('Failed to remove approver')
    } finally {
      setSaving(null)
    }
  }

  function addLevel(type: ApprovalType) {
    const level = nextLevel(type)
    setApprovers(prev => [...prev, { type, level, userId: '' }])
  }

  function ApproverLevelRow({ type, entry }: { type: ApprovalType; entry: ApproverEntry }) {
    const { level, userId } = entry
    const key = `${type}-${level}`
    const busy = saving === key || saving === `${key}-del`

    return (
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0 w-28 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">{levelLabel(level)}</span>
        <div className="flex-shrink-0 w-4 h-px bg-gray-300" />
        <select
          disabled={busy}
          value={userId}
          onChange={e => setApprover(type, level, e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition min-w-0"
        >
          <option value="">— Select approver —</option>
          {users.map(u => (
            <option key={u.userId} value={u.userId}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={() => removeLevel(type, level)}
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Remove this approver level"
        >
          {busy ? <span className="text-xs text-gray-400">…</span> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    )
  }

  function ApproverSection({ type }: { type: ApprovalType }) {
    const entries = getApproversFor(type)
    const meta = WORKFLOW_META[type]
    const Icon = meta.icon
    const count = entries.filter(e => e.userId).length

    return (
      <CollapsibleCard
        open={expanded.has(`legacy:${type}`)}
        onToggle={() => toggle(`legacy:${type}`)}
        icon={<Icon className="w-4 h-4 text-[#000000]" />}
        title={meta.title}
        subtitle={meta.subtitle}
        count={`${count} approver${count !== 1 ? 's' : ''} configured`}
        headerRight={<span className="text-[10px] font-semibold uppercase text-slate-400">Legacy</span>}
      >
        <div className="space-y-5">
          <WorkflowSteps steps={meta.steps} />
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Approval Levels</p>
            {entries.length === 0 ? (
              <p className="text-sm text-gray-400 mb-3">No approval levels configured. Add the first approver below.</p>
            ) : (
              <div className="space-y-2 mb-3">
                {entries.map(entry => (
                  <ApproverLevelRow key={`${type}-${entry.level}`} type={type} entry={entry} />
                ))}
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => addLevel(type)} className="gap-1.5 text-xs border-dashed">
              <Plus className="w-3.5 h-3.5" />
              Add Approval Level
            </Button>
          </div>
        </div>
      </CollapsibleCard>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 bg-gradient-to-b from-slate-50 to-white p-4 md:p-6 rounded-2xl">
      <SettingsTabs />
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Approval Workflows v2</h1>
              <NewFeatureBadge releasedAt="2026-05-01T00:00:00+08:00" />
            </div>
            <p className="text-gray-500 text-sm mt-1">Configure sequential approval levels for payroll, leave, overtime, time corrections, and attendance reviews</p>
          </div>
          <Link
            href="/settings/workflows"
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#000000] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary"
          >
            <Workflow className="h-4 w-4" />
            Workflow Builder
          </Link>
        </div>
      </div>

      {convertibleTypes.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-100 shrink-0">
            <Workflow className="w-5 h-5 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">Switch legacy workflows to the Workflow Builder</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {convertibleTypes.map(t => BUILDER_TYPE_LABELS[t] ?? t).join(', ')} {convertibleTypes.length === 1 ? 'is' : 'are'} still on the legacy approver chain.
              Convert {convertibleTypes.length === 1 ? 'it' : 'them'} into editable builder workflows — conditions and notifications become available, and the engine takes over. Existing approvers are kept; types with none become empty cards you can configure.
            </p>
          </div>
          <Button
            onClick={switchToBuilder}
            disabled={importing}
            className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            size="sm"
          >
            {importing ? 'Switching…' : 'Switch to Builder'}
          </Button>
        </div>
      )}

      {builderWorkflows.map(wf => {
        const dept = wf.departmentId
          ? (builderDepts.find(d => d.id === wf.departmentId)?.name ?? 'Department')
          : 'Company default'
        const approvals = wf.steps.filter(s => s.stepType === 'APPROVAL').length
        const notifies = wf.steps.filter(s => s.stepType === 'NOTIFY').length
        return (
          <CollapsibleCard
            key={wf.id}
            open={expanded.has(`builder:${wf.id}`)}
            onToggle={() => toggle(`builder:${wf.id}`)}
            icon={<Workflow className="w-4 h-4 text-[#000000]" />}
            title={
              <span className="inline-flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#dce5f7] text-[#000000]">
                  {BUILDER_TYPE_LABELS[wf.type] ?? wf.type}
                </span>
                {dept}
                {!wf.isActive && <span className="text-[10px] font-semibold text-amber-600 uppercase">inactive</span>}
              </span>
            }
            subtitle={`${approvals} approval${approvals !== 1 ? 's' : ''} · ${notifies} notification${notifies !== 1 ? 's' : ''} · Workflow Builder`}
            headerRight={
              <Link
                href={`/settings/workflows?type=${encodeURIComponent(wf.type)}${wf.departmentId ? `&dept=${encodeURIComponent(wf.departmentId)}` : ''}`}
                className="text-xs font-medium text-orange-600 hover:underline"
              >
                Edit
              </Link>
            }
          >
            <div className="space-y-1.5">
              {wf.steps.length === 0 ? (
                <p className="text-xs text-slate-400">No steps configured.</p>
              ) : (
                wf.steps.map((step, i) => {
                  const isApproval = step.stepType === 'APPROVAL'
                  const cond = describeConditions(step)
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${isApproval ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          {isApproval ? <UserCheck className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                          {describeStep(step, builderUsers)}
                        </span>
                        {cond && <p className="text-[11px] text-orange-600 mt-0.5">Only if {cond}</p>}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </CollapsibleCard>
        )
      })}

      {/* Legacy cards only show while a type has NOT been switched to the builder. */}
      {!hasBuilderFor('PAYROLL') && <ApproverSection type="PAYROLL" />}
      {!hasBuilderFor('LEAVE') && <ApproverSection type="LEAVE" />}
      {!hasBuilderFor('OVERTIME') && <ApproverSection type="OVERTIME" />}
      {!hasBuilderFor('TIME_CORRECTION') && <ApproverSection type="TIME_CORRECTION" />}
      {!hasBuilderFor('ATTENDANCE_REVIEW') && <ApproverSection type="ATTENDANCE_REVIEW" />}

      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#dce5f7]">
            <Users className="w-5 h-5 text-[#000000]" />
          </div>
          <p className="text-sm text-gray-600">
            Approvals are processed in order — the <strong>1st Approver</strong> must approve before the 2nd, and so on.
            Only users with <strong>Company Admin</strong>, <strong>HR Manager</strong>, or <strong>Payroll Officer</strong> roles are eligible.
            Manage roles in <a href="/settings/users" className="text-orange-600 font-medium hover:underline">User Management</a>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
