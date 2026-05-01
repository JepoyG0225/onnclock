'use client'
import { useState, useEffect, useCallback, type ComponentType } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, FileText, Users, Plus, Trash2, TimerReset, Clock3, ClipboardCheck } from 'lucide-react'
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
      { label: 'Draft', desc: 'Payroll run created', color: '#94a3b8' },
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
      { label: 'Filed', desc: 'Employee submits request', color: '#94a3b8' },
      { label: 'Pending', desc: 'Awaiting approvers', color: '#f59e0b' },
      { label: 'Approved/Rejected', desc: 'Final action by approvers', color: '#10b981' },
    ],
  },
  OVERTIME: {
    title: 'Overtime Request Workflow',
    subtitle: 'Approval chain for overtime requests before payroll.',
    icon: Clock3,
    steps: [
      { label: 'Submitted', desc: 'Employee files overtime', color: '#94a3b8' },
      { label: 'Review', desc: 'Approvers validate reason/hours', color: '#f59e0b' },
      { label: 'Approved', desc: 'Included in payroll run', color: '#10b981' },
    ],
  },
  TIME_CORRECTION: {
    title: 'Time Correction Workflow',
    subtitle: 'Manages DTR correction approvals and audit trace.',
    icon: TimerReset,
    steps: [
      { label: 'Requested', desc: 'Employee files correction', color: '#94a3b8' },
      { label: 'Verification', desc: 'Approvers review records', color: '#f59e0b' },
      { label: 'Applied', desc: 'Approved changes reflected in DTR', color: '#10b981' },
    ],
  },
  ATTENDANCE_REVIEW: {
    title: 'Attendance Review Workflow',
    subtitle: 'Controls weekly attendance review approvals.',
    icon: ClipboardCheck,
    steps: [
      { label: 'Submitted', desc: 'Week sent for review', color: '#94a3b8' },
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

export default function ApprovalWorkflowsPage() {
  const [users, setUsers] = useState<UserOption[]>([])
  const [approvers, setApprovers] = useState<ApproverEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/approvers')
    const data = await res.json().catch(() => ({}))
    setUsers(data.users ?? [])
    setApprovers(data.approvers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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

    return (
      <Card className="border-0 shadow-md bg-white/95">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className="w-4 h-4 text-[#2E4156]" />
            {meta.title}
            <span className="ml-auto text-xs font-normal text-gray-400">
              {entries.filter(e => e.userId).length} approver{entries.filter(e => e.userId).length !== 1 ? 's' : ''} configured
            </span>
          </CardTitle>
          <p className="text-xs text-slate-500">{meta.subtitle}</p>
        </CardHeader>
        <CardContent className="space-y-5">
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
        </CardContent>
      </Card>
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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Approval Workflows v2</h1>
          <NewFeatureBadge releasedAt="2026-05-01T00:00:00+08:00" />
        </div>
        <p className="text-gray-500 text-sm mt-1">Configure sequential approval levels for payroll, leave, overtime, time corrections, and attendance reviews</p>
      </div>

      <ApproverSection type="PAYROLL" />
      <ApproverSection type="LEAVE" />
      <ApproverSection type="OVERTIME" />
      <ApproverSection type="TIME_CORRECTION" />
      <ApproverSection type="ATTENDANCE_REVIEW" />

      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#D4D8DD]">
            <Users className="w-5 h-5 text-[#2E4156]" />
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
