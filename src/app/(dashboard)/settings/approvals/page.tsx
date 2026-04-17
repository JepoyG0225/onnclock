'use client'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, FileText, Users, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:     'bg-red-100 text-red-700',
  COMPANY_ADMIN:   'bg-purple-100 text-purple-700',
  HR_MANAGER:      'bg-[#C0C8CA] text-[#1A2D42]',
  PAYROLL_OFFICER: 'bg-orange-100 text-orange-700',
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:     'Super Admin',
  COMPANY_ADMIN:   'Company Admin',
  HR_MANAGER:      'HR Manager',
  PAYROLL_OFFICER: 'Payroll Officer',
}

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
  name:   string | null
  email:  string | null
  role:   string
}

interface ApproverEntry {
  type:   'PAYROLL' | 'LEAVE'
  level:  number
  userId: string
}

type WorkflowType = 'PAYROLL' | 'LEAVE'

const PAYROLL_STEPS = [
  { label: 'Draft',        desc: 'Payroll run created',               color: '#94a3b8' },
  { label: 'Computed',     desc: 'Payslips calculated',               color: '#3b82f6' },
  { label: 'For Approval', desc: 'Submitted by HR / Payroll Officer', color: '#f59e0b' },
  { label: 'Approved',     desc: 'Approved by configured approvers',  color: '#10b981' },
  { label: 'Locked',       desc: 'Final — no further changes',        color: '#8b5cf6' },
]

const LEAVE_STEPS = [
  { label: 'Filed',             desc: 'Employee submits request', color: '#94a3b8' },
  { label: 'Pending',           desc: 'Awaiting review',          color: '#f59e0b' },
  { label: 'Approved/Rejected', desc: 'Reviewed by approvers',    color: '#10b981' },
]

function WorkflowSteps({ steps }: { steps: typeof PAYROLL_STEPS }) {
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
  const [users,     setUsers]     = useState<UserOption[]>([])
  const [approvers, setApprovers] = useState<ApproverEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/settings/approvers')
    const data = await res.json().catch(() => ({}))
    setUsers(data.users ?? [])
    setApprovers(data.approvers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function getApproversFor(type: WorkflowType): ApproverEntry[] {
    return approvers.filter(a => a.type === type).sort((a, b) => a.level - b.level)
  }

  function nextLevel(type: WorkflowType): number {
    const levels = getApproversFor(type).map(a => a.level)
    return levels.length === 0 ? 1 : Math.max(...levels) + 1
  }

  async function setApprover(type: WorkflowType, level: number, userId: string) {
    const key = `${type}-${level}`
    setSaving(key)
    try {
      const res = await fetch('/api/settings/approvers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, type, level }),
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

  async function removeLevel(type: WorkflowType, level: number) {
    const key = `${type}-${level}-del`
    setSaving(key)
    try {
      const res = await fetch('/api/settings/approvers', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type, level }),
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

  function addLevel(type: WorkflowType) {
    const level = nextLevel(type)
    // Add a placeholder entry so the row appears; user must pick a user from dropdown
    setApprovers(prev => [...prev, { type, level, userId: '' }])
  }

  function ApproverLevelRow({ type, entry }: { type: WorkflowType; entry: ApproverEntry }) {
    const { level, userId } = entry
    const key  = `${type}-${level}`
    const busy = saving === key || saving === `${key}-del`

    return (
      <div className="flex items-center gap-3">
        {/* Level label */}
        <span className="flex-shrink-0 w-28 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {levelLabel(level)}
        </span>

        {/* Connector line */}
        <div className="flex-shrink-0 w-4 h-px bg-gray-300" />

        {/* User selector */}
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

        {/* Remove button */}
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

  function ApproverSection({ type, steps }: { type: WorkflowType; steps: typeof PAYROLL_STEPS }) {
    const entries = getApproversFor(type)
    const icon    = type === 'PAYROLL'
      ? <CheckCircle className="w-4 h-4 text-green-600" />
      : <FileText className="w-4 h-4 text-[#2E4156]" />
    const title   = type === 'PAYROLL' ? 'Payroll Approval Workflow' : 'Leave Request Approval Workflow'

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            {icon}
            {title}
            <span className="ml-auto text-xs font-normal text-gray-400">
              {entries.filter(e => e.userId).length} approver{entries.filter(e => e.userId).length !== 1 ? 's' : ''} configured
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <WorkflowSteps steps={steps} />

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

            <Button
              size="sm"
              variant="outline"
              onClick={() => addLevel(type)}
              className="gap-1.5 text-xs border-dashed"
            >
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Approval Workflows</h1>
        <p className="text-gray-500 text-sm mt-1">Configure sequential approval levels for payroll runs and leave requests</p>
      </div>

      <ApproverSection type="PAYROLL" steps={PAYROLL_STEPS} />
      <ApproverSection type="LEAVE"   steps={LEAVE_STEPS}   />

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

