'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, ArrowUp, ArrowDown, UserCheck, Bell, Filter, Save, Workflow as WorkflowIcon } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import NewFeatureBadge from '@/components/ui/NewFeatureBadge'

// ── Domain config ────────────────────────────────────────────────────────────

type WorkflowType = 'LEAVE' | 'OVERTIME' | 'CASH_ADVANCE' | 'BUDGET' | 'TIME_CORRECTION' | 'PAYROLL' | 'ATTENDANCE_REVIEW'

const TYPES: { key: WorkflowType; label: string; live: boolean }[] = [
  { key: 'PAYROLL', label: 'Payroll', live: true },
  { key: 'LEAVE', label: 'Leave', live: true },
  { key: 'OVERTIME', label: 'Overtime', live: true },
  { key: 'CASH_ADVANCE', label: 'Cash Advance', live: true },
  { key: 'BUDGET', label: 'Budget Requisition', live: true },
  { key: 'TIME_CORRECTION', label: 'Time Correction', live: true },
  { key: 'ATTENDANCE_REVIEW', label: 'Attendance Review', live: true },
]

interface FieldDef { field: string; label: string; kind: 'number' | 'text' | 'boolean' }

// Fields available for condition guards, per request type.
const FIELDS: Record<WorkflowType, FieldDef[]> = {
  LEAVE: [
    { field: 'totalDays', label: 'Total days', kind: 'number' },
    { field: 'leaveType', label: 'Leave type', kind: 'text' },
    { field: 'isWithPay', label: 'Is paid', kind: 'boolean' },
    { field: 'isHalfDay', label: 'Is half-day', kind: 'boolean' },
  ],
  OVERTIME: [
    { field: 'hours', label: 'Hours', kind: 'number' },
  ],
  CASH_ADVANCE: [
    { field: 'amount', label: 'Amount', kind: 'number' },
  ],
  BUDGET: [
    { field: 'amount', label: 'Amount', kind: 'number' },
    { field: 'title', label: 'Title', kind: 'text' },
  ],
  TIME_CORRECTION: [],
  PAYROLL: [
    { field: 'totalGross', label: 'Total gross', kind: 'number' },
  ],
  ATTENDANCE_REVIEW: [],
}

const OPS: { op: string; label: string }[] = [
  { op: 'eq', label: '=' },
  { op: 'ne', label: '≠' },
  { op: 'gt', label: '>' },
  { op: 'gte', label: '≥' },
  { op: 'lt', label: '<' },
  { op: 'lte', label: '≤' },
  { op: 'in', label: 'in (comma list)' },
  { op: 'contains', label: 'contains' },
]

const ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'DEPARTMENT_HEAD']

// ── Types ────────────────────────────────────────────────────────────────────

interface UserOption { userId: string; name: string | null; email: string | null; role: string }
interface DeptOption { id: string; name: string }

interface ConditionRule { field: string; op: string; value: string }
interface Conditions { match: 'ALL' | 'ANY'; rules: ConditionRule[] }

interface Step {
  order: number
  stepType: 'APPROVAL' | 'NOTIFY'
  conditions?: Conditions | null
  approverType?: string | null
  approverUserId?: string | null
  approverRole?: string | null
  notifyTarget?: string | null
  notifyUserId?: string | null
  notifyRole?: string | null
  notifyChannel?: string | null
  messageTitle?: string | null
  messageBody?: string | null
}

interface ApiWorkflow {
  id: string
  type: WorkflowType
  name: string
  departmentId: string | null
  isActive: boolean
  steps: Step[]
}

const DEFAULT_SCOPE = '__default__'

// ── UI helpers ───────────────────────────────────────────────────────────────

const selectCls =
  'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition'

// NOTE: ConditionEditor and StepCard are declared at MODULE scope (not inside
// the page component). Declaring them inside the component would give them a new
// identity on every render, remounting their inputs and dropping focus on every
// keystroke (the title/body fields bug). Module scope keeps their identity stable.

// ── Condition editor ─────────────────────────────────────────────────────────
function ConditionEditor({ idx, step, fields, updateStep }: {
  idx: number
  step: Step
  fields: FieldDef[]
  updateStep: (idx: number, patch: Partial<Step>) => void
}) {
  const cond = step.conditions
  if (fields.length === 0) return null

  if (!cond) {
    return (
      <button
        onClick={() => updateStep(idx, { conditions: { match: 'ALL', rules: [{ field: fields[0].field, op: 'eq', value: '' }] } })}
        className="inline-flex items-center gap-1.5 text-xs text-orange-600 hover:underline"
      >
        <Filter className="w-3 h-3" /> Add condition (only run this step if…)
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-orange-100 bg-orange-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Filter className="w-3 h-3 text-orange-600" />
        <span className="text-gray-600">Run this step only if</span>
        <select
          value={cond.match}
          onChange={e => updateStep(idx, { conditions: { ...cond, match: e.target.value as 'ALL' | 'ANY' } })}
          className={selectCls}
        >
          <option value="ALL">ALL</option>
          <option value="ANY">ANY</option>
        </select>
        <span className="text-gray-600">of these are true:</span>
        <button onClick={() => updateStep(idx, { conditions: null })} className="ml-auto text-gray-400 hover:text-red-500" title="Remove all conditions">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {cond.rules.map((rule, ri) => (
        <div key={ri} className="flex items-center gap-2">
          <select
            value={rule.field}
            onChange={e => {
              const rules = [...cond.rules]; rules[ri] = { ...rule, field: e.target.value }
              updateStep(idx, { conditions: { ...cond, rules } })
            }}
            className={selectCls}
          >
            {fields.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
          </select>
          <select
            value={rule.op}
            onChange={e => {
              const rules = [...cond.rules]; rules[ri] = { ...rule, op: e.target.value }
              updateStep(idx, { conditions: { ...cond, rules } })
            }}
            className={selectCls}
          >
            {OPS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
          </select>
          <input
            value={rule.value}
            onChange={e => {
              const rules = [...cond.rules]; rules[ri] = { ...rule, value: e.target.value }
              updateStep(idx, { conditions: { ...cond, rules } })
            }}
            placeholder="value"
            className={`${selectCls} flex-1 min-w-0`}
          />
          <button
            onClick={() => {
              const rules = cond.rules.filter((_, i) => i !== ri)
              updateStep(idx, { conditions: rules.length ? { ...cond, rules } : null })
            }}
            className="text-gray-400 hover:text-red-500"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => updateStep(idx, { conditions: { ...cond, rules: [...cond.rules, { field: fields[0].field, op: 'eq', value: '' }] } })}
        className="text-xs text-orange-600 hover:underline inline-flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Add rule
      </button>
    </div>
  )
}

// ── Step card ──────────────────────────────────────────────────────────────
function StepCard({ idx, step, stepsLength, users, fields, updateStep, removeStep, moveStep }: {
  idx: number
  step: Step
  stepsLength: number
  users: UserOption[]
  fields: FieldDef[]
  updateStep: (idx: number, patch: Partial<Step>) => void
  removeStep: (idx: number) => void
  moveStep: (idx: number, dir: -1 | 1) => void
}) {
  const isApproval = step.stepType === 'APPROVAL'
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold ${isApproval ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
          {isApproval ? <UserCheck className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          Step {idx + 1} · {isApproval ? 'Approval' : 'Notify'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
          <button onClick={() => moveStep(idx, 1)} disabled={idx === stepsLength - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
          <button onClick={() => removeStep(idx)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {isApproval ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 w-20">Approver</span>
          <select value={step.approverType ?? 'SPECIFIC_USER'} onChange={e => updateStep(idx, { approverType: e.target.value, approverUserId: null, approverRole: null })} className={selectCls}>
            <option value="SPECIFIC_USER">Specific user</option>
            <option value="DEPARTMENT_HEAD">Reports To (requester&apos;s manager)</option>
            <option value="ROLE">Anyone with role</option>
          </select>
          {step.approverType === 'SPECIFIC_USER' && (
            <select value={step.approverUserId ?? ''} onChange={e => updateStep(idx, { approverUserId: e.target.value })} className={`${selectCls} flex-1 min-w-0`}>
              <option value="">— Select user —</option>
              {users.map(u => <option key={u.userId} value={u.userId}>{u.name ?? u.email} ({u.role})</option>)}
            </select>
          )}
          {step.approverType === 'ROLE' && (
            <select value={step.approverRole ?? ''} onChange={e => updateStep(idx, { approverRole: e.target.value })} className={selectCls}>
              <option value="">— Select role —</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 w-20">Notify</span>
            <select value={step.notifyTarget ?? 'REQUESTER'} onChange={e => updateStep(idx, { notifyTarget: e.target.value, notifyUserId: null, notifyRole: null })} className={selectCls}>
              <option value="REQUESTER">Requester</option>
              <option value="DEPARTMENT_HEAD">Reports To (requester&apos;s manager)</option>
              <option value="SPECIFIC_USER">Specific user</option>
              <option value="ROLE">Anyone with role</option>
            </select>
            {step.notifyTarget === 'SPECIFIC_USER' && (
              <select value={step.notifyUserId ?? ''} onChange={e => updateStep(idx, { notifyUserId: e.target.value })} className={`${selectCls} flex-1 min-w-0`}>
                <option value="">— Select user —</option>
                {users.map(u => <option key={u.userId} value={u.userId}>{u.name ?? u.email}</option>)}
              </select>
            )}
            {step.notifyTarget === 'ROLE' && (
              <select value={step.notifyRole ?? ''} onChange={e => updateStep(idx, { notifyRole: e.target.value })} className={selectCls}>
                <option value="">— Select role —</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            <select value={step.notifyChannel ?? 'IN_APP'} onChange={e => updateStep(idx, { notifyChannel: e.target.value })} className={selectCls}>
              <option value="IN_APP">In-app</option>
              <option value="EMAIL">Email</option>
              <option value="BOTH">Both</option>
            </select>
          </div>
          <input value={step.messageTitle ?? ''} onChange={e => updateStep(idx, { messageTitle: e.target.value })} placeholder="Message title" className={`${selectCls} w-full`} />
          <textarea value={step.messageBody ?? ''} onChange={e => updateStep(idx, { messageBody: e.target.value })} placeholder="Message body — use {requesterName}, {requestType}, {leaveType}" rows={2} className={`${selectCls} w-full resize-y`} />
        </div>
      )}

      <ConditionEditor idx={idx} step={step} fields={fields} updateStep={updateStep} />
    </div>
  )
}

export default function WorkflowBuilderPage() {
  const [users, setUsers] = useState<UserOption[]>([])
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [workflows, setWorkflows] = useState<ApiWorkflow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Open a specific workflow when arriving from the Approval Workflows "Edit"
  // link (?type=…&dept=…). Falls back to Leave / Company default.
  const searchParams = useSearchParams()
  const initialType = (TYPES.find(t => t.key === searchParams.get('type'))?.key ?? 'LEAVE') as WorkflowType
  const initialDept = searchParams.get('dept')
  const [type, setType] = useState<WorkflowType>(initialType)
  const [scope, setScope] = useState<string>(initialDept ? initialDept : DEFAULT_SCOPE) // DEFAULT_SCOPE or a departmentId
  const [steps, setSteps] = useState<Step[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/workflows')
    const data = await res.json().catch(() => ({}))
    setUsers(data.users ?? [])
    setDepartments(data.departments ?? [])
    setWorkflows(data.workflows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Load the steps for the currently-selected (type, scope) into the editor.
  useEffect(() => {
    const departmentId = scope === DEFAULT_SCOPE ? null : scope
    const wf = workflows.find(w => w.type === type && w.departmentId === departmentId)
    setSteps(
      wf
        ? wf.steps.map(s => ({ ...s, conditions: (s.conditions as Conditions | null) ?? null }))
        : [],
    )
  }, [type, scope, workflows])

  const updateStep = useCallback((idx: number, patch: Partial<Step>) => {
    setSteps(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }, [])

  function addStep(stepType: 'APPROVAL' | 'NOTIFY') {
    setSteps(prev => [
      ...prev,
      stepType === 'APPROVAL'
        ? { order: prev.length + 1, stepType, approverType: 'SPECIFIC_USER', notifyChannel: null }
        : { order: prev.length + 1, stepType, notifyTarget: 'REQUESTER', notifyChannel: 'IN_APP', messageTitle: '', messageBody: '' },
    ])
  }

  const removeStep = useCallback((idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })))
  }, [])

  const moveStep = useCallback((idx: number, dir: -1 | 1) => {
    setSteps(prev => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }, [])

  async function save() {
    setSaving(true)
    try {
      const departmentId = scope === DEFAULT_SCOPE ? null : scope
      const deptName = scope === DEFAULT_SCOPE ? 'Company default' : departments.find(d => d.id === scope)?.name
      const res = await fetch('/api/settings/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          departmentId,
          name: `${type} — ${deptName}`,
          isActive: true,
          steps: steps.map((s, i) => ({
            ...s,
            order: i + 1,
            conditions: s.conditions && s.conditions.rules.length > 0 ? s.conditions : null,
          })),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Workflow saved')
      await load()
    } catch {
      toast.error('Failed to save workflow')
    } finally {
      setSaving(false)
    }
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
          <WorkflowIcon className="w-5 h-5 text-[#032b63]" />
          <h1 className="text-2xl font-bold text-gray-900">Workflow Builder</h1>
          <NewFeatureBadge releasedAt="2026-06-01T00:00:00+08:00" />
        </div>
        <p className="text-gray-500 text-sm mt-1">
          Build approval workflows per department with conditional steps and notifications.
          Requests route through the matching department workflow, or the company default when a department has none.
        </p>
      </div>

      <Card className="border-0 shadow-md bg-white/95">
        <CardHeader>
          <CardTitle className="text-sm">Configure workflow</CardTitle>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase">Request type</span>
              <select value={type} onChange={e => setType(e.target.value as WorkflowType)} className={selectCls}>
                {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}{t.live ? '' : ' (config only)'}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase">Scope</span>
              <select value={scope} onChange={e => setScope(e.target.value)} className={selectCls}>
                <option value={DEFAULT_SCOPE}>Company default (all departments)</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.length === 0 ? (
            <p className="text-sm text-gray-400">No steps yet. Add an approval or notification step to start the chain.</p>
          ) : (
            steps.map((step, idx) => (
              <StepCard
                key={idx}
                idx={idx}
                step={step}
                stepsLength={steps.length}
                users={users}
                fields={FIELDS[type]}
                updateStep={updateStep}
                removeStep={removeStep}
                moveStep={moveStep}
              />
            ))
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => addStep('APPROVAL')} className="gap-1.5 text-xs border-dashed">
              <UserCheck className="w-3.5 h-3.5" /> Add approval step
            </Button>
            <Button size="sm" variant="outline" onClick={() => addStep('NOTIFY')} className="gap-1.5 text-xs border-dashed">
              <Bell className="w-3.5 h-3.5" /> Add notification step
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 text-xs ml-auto bg-[#032b63] hover:bg-primary">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save workflow'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[#dce5f7]"><WorkflowIcon className="w-5 h-5 text-[#032b63]" /></div>
          <p className="text-sm text-gray-600">
            Steps run top to bottom. <strong>Approval</strong> steps wait for the assigned approver; <strong>notification</strong> steps fire
            automatically as the request passes them. A step with a <strong>condition</strong> is skipped when its rule is false —
            e.g. add an approval step guarded by <em>amount &gt; 50000</em> to require an extra sign-off only on large requests.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
