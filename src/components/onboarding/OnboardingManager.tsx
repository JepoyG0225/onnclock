'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, BookOpen, CheckCircle2, ChevronDown, ChevronRight, ClipboardList,
  ExternalLink, FileText, Layers, Link2, Loader2, Monitor, Paperclip, PlusCircle,
  Shield, Trash2, Upload, Users, Video, X, UserPlus, Building2, Calendar, Clock, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'PRE_BOARDING' | 'DAY_1' | 'WEEK_1' | 'MONTH_1' | 'MONTH_3'
type OwnerType = 'HR' | 'IT' | 'MANAGER' | 'EMPLOYEE' | 'FINANCE'
type StepType = 'DOCUMENT' | 'VIDEO' | 'TASK' | 'ORIENTATION' | 'SYSTEM_ACCESS' | 'POLICY_ACKNOWLEDGEMENT'
type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
type ProcessStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

interface Attachment { url: string; name: string; addedAt: string }
interface StepMeta { phase?: Phase; ownerType?: OwnerType; attachments?: Attachment[]; resourceUrl?: string }

interface ProcessStep {
  id: string
  title: string
  status: StepStatus
  stepType: StepType
  isRequired: boolean
  sortOrder: number
  dueDate: string | null
  completedAt: string | null
  notes: string | null
  proofUrl: string | null
  metadata: StepMeta | null
}

interface EmployeeInfo {
  id: string
  employeeNo: string
  firstName: string
  lastName: string
  hireDate: string | null
  photoUrl: string | null
  department: { name: string } | null
  position: { title: string } | null
}

interface OnboardingProcess {
  id: string
  status: ProcessStatus
  startedAt: string | null
  completedAt: string | null
  notes: string | null
  createdAt: string
  employee: EmployeeInfo
  template: { id: string; name: string } | null
  steps: ProcessStep[]
}

interface TemplateStep {
  id: string
  title: string
  sortOrder: number
  stepType: StepType
  isRequired: boolean
  dueDaysFromStart: number | null
  metadata: StepMeta | null
}

interface OnboardingTemplate {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  steps: TemplateStep[]
}

interface EmployeeOption {
  id: string
  employeeNo: string
  firstName: string
  lastName: string
  department: { name: string } | null
  position: { title: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASES: { key: Phase; label: string; shortLabel: string; color: string; bg: string; border: string }[] = [
  { key: 'PRE_BOARDING', label: 'Pre-Boarding', shortLabel: 'Pre-Board', color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-300' },
  { key: 'DAY_1',        label: 'Day 1',        shortLabel: 'Day 1',     color: 'text-blue-700',  bg: 'bg-blue-50',   border: 'border-blue-300' },
  { key: 'WEEK_1',       label: 'Week 1',       shortLabel: 'Week 1',    color: 'text-teal-700',  bg: 'bg-teal-50',   border: 'border-teal-300' },
  { key: 'MONTH_1',      label: '30-Day',       shortLabel: '30-Day',    color: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-300' },
  { key: 'MONTH_3',      label: '90-Day',       shortLabel: '90-Day',    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-300' },
]

const OWNER_TYPES: { key: OwnerType; label: string; color: string }[] = [
  { key: 'HR',       label: 'HR',      color: 'bg-blue-100 text-blue-700' },
  { key: 'IT',       label: 'IT',      color: 'bg-purple-100 text-purple-700' },
  { key: 'MANAGER',  label: 'Mgr',     color: 'bg-amber-100 text-amber-700' },
  { key: 'EMPLOYEE', label: 'Emp',     color: 'bg-emerald-100 text-emerald-700' },
  { key: 'FINANCE',  label: 'Fin',     color: 'bg-orange-100 text-orange-700' },
]

const STEP_TYPES: { key: StepType; label: string }[] = [
  { key: 'TASK',                   label: 'Task' },
  { key: 'DOCUMENT',               label: 'Document' },
  { key: 'POLICY_ACKNOWLEDGEMENT', label: 'Policy Sign-off' },
  { key: 'ORIENTATION',            label: 'Orientation' },
  { key: 'SYSTEM_ACCESS',          label: 'System Access' },
  { key: 'VIDEO',                  label: 'Video' },
]

const PH_PRESET = [
  { title: 'Submit 2 Valid Government IDs',          phase: 'PRE_BOARDING' as Phase, ownerType: 'EMPLOYEE' as OwnerType, stepType: 'DOCUMENT' as StepType,               dueDaysFromStart: 0,  isRequired: true },
  { title: 'Sign Employment Contract',               phase: 'PRE_BOARDING' as Phase, ownerType: 'EMPLOYEE' as OwnerType, stepType: 'POLICY_ACKNOWLEDGEMENT' as StepType,  dueDaysFromStart: 0,  isRequired: true },
  { title: 'BIR Form 1902 (TIN Registration)',       phase: 'PRE_BOARDING' as Phase, ownerType: 'HR' as OwnerType,       stepType: 'DOCUMENT' as StepType,               dueDaysFromStart: 1,  isRequired: true },
  { title: 'SSS Registration (Form E-1)',            phase: 'PRE_BOARDING' as Phase, ownerType: 'HR' as OwnerType,       stepType: 'DOCUMENT' as StepType,               dueDaysFromStart: 3,  isRequired: true },
  { title: 'PhilHealth Registration (PMRF)',         phase: 'PRE_BOARDING' as Phase, ownerType: 'HR' as OwnerType,       stepType: 'DOCUMENT' as StepType,               dueDaysFromStart: 3,  isRequired: true },
  { title: 'Pag-IBIG Member Registration',          phase: 'PRE_BOARDING' as Phase, ownerType: 'EMPLOYEE' as OwnerType, stepType: 'DOCUMENT' as StepType,               dueDaysFromStart: 5,  isRequired: true },
  { title: 'Bank Account Details for Payroll',       phase: 'PRE_BOARDING' as Phase, ownerType: 'EMPLOYEE' as OwnerType, stepType: 'DOCUMENT' as StepType,               dueDaysFromStart: 2,  isRequired: true },
  { title: 'NBI Clearance Submission',               phase: 'PRE_BOARDING' as Phase, ownerType: 'EMPLOYEE' as OwnerType, stepType: 'DOCUMENT' as StepType,               dueDaysFromStart: 5,  isRequired: false },
  { title: 'Emergency Contact Information',          phase: 'PRE_BOARDING' as Phase, ownerType: 'EMPLOYEE' as OwnerType, stepType: 'TASK' as StepType,                   dueDaysFromStart: 0,  isRequired: true },
  { title: 'Welcome Orientation',                    phase: 'DAY_1' as Phase,        ownerType: 'HR' as OwnerType,       stepType: 'ORIENTATION' as StepType,            dueDaysFromStart: 0,  isRequired: true },
  { title: 'Email & System Access Setup',            phase: 'DAY_1' as Phase,        ownerType: 'IT' as OwnerType,       stepType: 'SYSTEM_ACCESS' as StepType,          dueDaysFromStart: 0,  isRequired: true },
  { title: 'Equipment Distribution',                phase: 'DAY_1' as Phase,        ownerType: 'IT' as OwnerType,       stepType: 'TASK' as StepType,                   dueDaysFromStart: 0,  isRequired: true },
  { title: 'Employee Handbook Acknowledgment',       phase: 'DAY_1' as Phase,        ownerType: 'EMPLOYEE' as OwnerType, stepType: 'POLICY_ACKNOWLEDGEMENT' as StepType,  dueDaysFromStart: 1,  isRequired: true },
  { title: 'Introduction to Team & Manager',         phase: 'DAY_1' as Phase,        ownerType: 'MANAGER' as OwnerType,  stepType: 'ORIENTATION' as StepType,            dueDaysFromStart: 0,  isRequired: true },
  { title: 'Timekeeping System Setup',               phase: 'WEEK_1' as Phase,       ownerType: 'HR' as OwnerType,       stepType: 'SYSTEM_ACCESS' as StepType,          dueDaysFromStart: 3,  isRequired: true },
  { title: 'Role-Specific Training (Week 1)',        phase: 'WEEK_1' as Phase,       ownerType: 'MANAGER' as OwnerType,  stepType: 'TASK' as StepType,                   dueDaysFromStart: 7,  isRequired: true },
  { title: '1:1 Meeting with Manager',               phase: 'WEEK_1' as Phase,       ownerType: 'MANAGER' as OwnerType,  stepType: 'TASK' as StepType,                   dueDaysFromStart: 5,  isRequired: true },
  { title: 'IT Security Training',                   phase: 'WEEK_1' as Phase,       ownerType: 'IT' as OwnerType,       stepType: 'TASK' as StepType,                   dueDaysFromStart: 5,  isRequired: true },
  { title: 'Benefits Enrollment',                    phase: 'WEEK_1' as Phase,       ownerType: 'HR' as OwnerType,       stepType: 'TASK' as StepType,                   dueDaysFromStart: 7,  isRequired: true },
  { title: 'Gov\'t Registration Verification',       phase: 'MONTH_1' as Phase,      ownerType: 'HR' as OwnerType,       stepType: 'TASK' as StepType,                   dueDaysFromStart: 25, isRequired: true },
  { title: '30-Day Probationary Review',             phase: 'MONTH_1' as Phase,      ownerType: 'MANAGER' as OwnerType,  stepType: 'TASK' as StepType,                   dueDaysFromStart: 30, isRequired: true },
  { title: 'Performance Goals Setting',              phase: 'MONTH_1' as Phase,      ownerType: 'MANAGER' as OwnerType,  stepType: 'TASK' as StepType,                   dueDaysFromStart: 30, isRequired: true },
  { title: 'Payroll Verification (First Payslip)',   phase: 'MONTH_1' as Phase,      ownerType: 'HR' as OwnerType,       stepType: 'TASK' as StepType,                   dueDaysFromStart: 20, isRequired: true },
  { title: '90-Day Performance Review',              phase: 'MONTH_3' as Phase,      ownerType: 'MANAGER' as OwnerType,  stepType: 'TASK' as StepType,                   dueDaysFromStart: 90, isRequired: true },
  { title: 'Regularization Assessment',              phase: 'MONTH_3' as Phase,      ownerType: 'HR' as OwnerType,       stepType: 'TASK' as StepType,                   dueDaysFromStart: 90, isRequired: true },
  { title: 'Onboarding Completion Sign-off',         phase: 'MONTH_3' as Phase,      ownerType: 'HR' as OwnerType,       stepType: 'TASK' as StepType,                   dueDaysFromStart: 90, isRequired: true },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(e: EmployeeInfo) {
  return `${e.firstName[0] ?? ''}${e.lastName[0] ?? ''}`.toUpperCase()
}

function avatarColor(name: string) {
  const colors = ['bg-blue-500', 'bg-teal-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-emerald-500']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function daysSince(dateStr: string | null) {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function isOverdue(step: ProcessStep) {
  if (!step.dueDate || step.status === 'COMPLETED' || step.status === 'SKIPPED') return false
  return new Date(step.dueDate) < new Date()
}

function stepPhase(step: ProcessStep): Phase {
  return (step.metadata as StepMeta | null)?.phase ?? 'PRE_BOARDING'
}

function stepOwner(step: ProcessStep): OwnerType {
  return (step.metadata as StepMeta | null)?.ownerType ?? 'HR'
}

function phaseInfo(key: Phase) {
  return PHASES.find((p) => p.key === key) ?? PHASES[0]
}

function ownerInfo(key: OwnerType) {
  return OWNER_TYPES.find((o) => o.key === key) ?? OWNER_TYPES[0]
}

function stepIcon(type: StepType) {
  const cls = 'w-3.5 h-3.5 shrink-0'
  switch (type) {
    case 'DOCUMENT': return <FileText className={cls} />
    case 'VIDEO': return <Video className={cls} />
    case 'ORIENTATION': return <Users className={cls} />
    case 'SYSTEM_ACCESS': return <Monitor className={cls} />
    case 'POLICY_ACKNOWLEDGEMENT': return <Shield className={cls} />
    default: return <ClipboardList className={cls} />
  }
}

function processProgress(process: OnboardingProcess) {
  const req = process.steps.filter((s) => s.isRequired)
  const done = req.filter((s) => s.status === 'COMPLETED').length
  const total = req.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const overdue = process.steps.filter(isOverdue).length
  return { done, total, pct, overdue }
}

function currentPhase(process: OnboardingProcess): Phase {
  const order: Phase[] = ['PRE_BOARDING', 'DAY_1', 'WEEK_1', 'MONTH_1', 'MONTH_3']
  for (const phase of order) {
    const phaseTasks = process.steps.filter((s) => stepPhase(s) === phase)
    if (phaseTasks.length === 0) continue
    const incomplete = phaseTasks.filter((s) => s.status !== 'COMPLETED' && s.status !== 'SKIPPED')
    if (incomplete.length > 0) return phase
  }
  return 'MONTH_3'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OwnerBadge({ owner }: { owner: OwnerType }) {
  const o = ownerInfo(owner)
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${o.color}`}>
      {o.label}
    </span>
  )
}

function PhasePill({ phase, small }: { phase: Phase; small?: boolean }) {
  const p = phaseInfo(phase)
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${p.color} ${p.bg} ${p.border} ${small ? '' : ''}`}>
      {p.shortLabel}
    </span>
  )
}

function StatusDot({ status, overdue }: { status: StepStatus; overdue?: boolean }) {
  if (overdue && status !== 'COMPLETED') return <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
  if (status === 'COMPLETED') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
  if (status === 'IN_PROGRESS') return <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
  if (status === 'SKIPPED') return <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
  return <div className="w-4 h-4 rounded-full border-2 border-slate-300 bg-white shrink-0" />
}

function ProgressRing({ pct, size = 52 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = pct === 100 ? '#10b981' : pct > 60 ? '#3b82f6' : pct > 30 ? '#f59e0b' : '#e2e8f0'
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={6} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth={6} fill="none"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  )
}

// ─── Process Card ─────────────────────────────────────────────────────────────

function ProcessCard({
  process, onClick, onDelete, deleting,
}: {
  process: OnboardingProcess
  onClick: () => void
  onDelete: (id: string) => void
  deleting: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { done, total, pct, overdue } = processProgress(process)
  const phase = currentPhase(process)
  const days = daysSince(process.startedAt)
  const emp = process.employee
  const color = avatarColor(`${emp.firstName}${emp.lastName}`)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md transition-all group">
      <div
        onClick={onClick}
        className="p-5 cursor-pointer"
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center text-white font-black text-sm shrink-0`}>
            {emp.photoUrl ? (
              <img src={emp.photoUrl} alt={emp.firstName} className="w-full h-full object-cover rounded-xl" />
            ) : initials(emp)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-slate-900 group-hover:text-[#1A2D42]">
                {emp.lastName}, {emp.firstName}
              </p>
              {overdue > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-200">
                  <AlertCircle className="w-3 h-3" /> {overdue} overdue
                </span>
              )}
              {process.status === 'COMPLETED' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> Completed
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {emp.position?.title ?? '—'} · {emp.department?.name ?? '—'}
            </p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <PhasePill phase={phase} />
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Day {days}
              </span>
              {process.template && (
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> {process.template.name}
                </span>
              )}
            </div>
          </div>

          {/* Progress ring */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <div className="relative">
              <ProgressRing pct={pct} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] font-black text-slate-700">{pct}%</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">{done}/{total} tasks</p>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-400 mt-1 shrink-0 group-hover:text-slate-600" />
        </div>

        {/* Mini progress bar */}
        <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-[#1A2D42]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Delete action row */}
      <div className="px-5 pb-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-2.5">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Remove this onboarding?</span>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(process.id) }}
              disabled={deleting}
              className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 flex items-center gap-1"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Remove
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Step Attachment Panel ────────────────────────────────────────────────────

function StepAttachmentPanel({
  step, processId, onSaved,
}: {
  step: ProcessStep
  processId: string
  onSaved: () => void
}) {
  const [urlInput, setUrlInput] = useState('')
  const [urlName, setUrlName] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const meta = (step.metadata ?? {}) as StepMeta
  const existingAttachments: Attachment[] = meta.attachments ?? []
  const resourceUrl = meta.resourceUrl

  async function addUrl() {
    const url = urlInput.trim()
    if (!url) return
    setUploading(true)
    try {
      const res = await fetch(`/api/onboarding/processes/${processId}/steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofUrl: url, proofFileName: urlName.trim() || 'Link' }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error ?? 'Failed') }
      toast.success('Link added')
      setUrlInput('')
      setUrlName('')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add link')
    } finally {
      setUploading(false)
    }
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch(`/api/onboarding/processes/${processId}/steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofFile: dataUrl, proofFileName: file.name }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error ?? 'Upload failed') }
      toast.success('File uploaded')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-2 ml-7 space-y-2.5 pb-1">
      {/* Template resource URL */}
      {resourceUrl && (
        <a
          href={resourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-800 hover:underline"
        >
          <ExternalLink className="w-3 h-3 shrink-0" />
          <span className="truncate">{resourceUrl}</span>
        </a>
      )}

      {/* Existing attachments */}
      {existingAttachments.length > 0 && (
        <div className="space-y-1">
          {existingAttachments.map((att, i) => (
            <a
              key={i}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-900 hover:underline"
            >
              <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{att.name}</span>
              <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0" />
            </a>
          ))}
        </div>
      )}

      {/* Add URL */}
      <div className="flex gap-1.5">
        <div className="flex-1 space-y-1">
          <input
            value={urlName}
            onChange={(e) => setUrlName(e.target.value)}
            placeholder="Label (optional)"
            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
          />
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste URL (Google Drive, SharePoint...)"
            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
          />
        </div>
        <button
          onClick={addUrl}
          disabled={uploading || !urlInput.trim()}
          className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
          Add
        </button>
      </div>

      {/* File upload */}
      <div>
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2.5 py-1 rounded-lg border border-dashed border-slate-300 hover:border-slate-400 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          Upload file (PDF, DOC, image — max 10 MB)
        </button>
      </div>
    </div>
  )
}

// ─── Process Detail Drawer ────────────────────────────────────────────────────

function ProcessDrawer({
  process, onClose, onStepUpdate, onRefresh,
}: {
  process: OnboardingProcess
  onClose: () => void
  onStepUpdate: (processId: string, stepId: string, status: StepStatus) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const [updating, setUpdating] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Phase[]>(['PRE_BOARDING', 'DAY_1', 'WEEK_1', 'MONTH_1', 'MONTH_3'])
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  const emp = process.employee
  const { done, total, pct, overdue } = processProgress(process)
  const days = daysSince(process.startedAt)
  const color = avatarColor(`${emp.firstName}${emp.lastName}`)

  // Group steps by phase
  const byPhase = useMemo(() => {
    const map = new Map<Phase, ProcessStep[]>()
    for (const ph of PHASES) map.set(ph.key, [])
    for (const step of process.steps) {
      const ph = stepPhase(step)
      map.get(ph)?.push(step)
    }
    return map
  }, [process.steps])

  async function toggle(step: ProcessStep) {
    setUpdating(step.id)
    const next: StepStatus = step.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    await onStepUpdate(process.id, step.id, next)
    setUpdating(null)
  }

  function togglePhase(phase: Phase) {
    setExpanded((prev) =>
      prev.includes(phase) ? prev.filter((p) => p !== phase) : [...prev, phase]
    )
  }

  function phaseStats(phase: Phase) {
    const steps = byPhase.get(phase) ?? []
    const done = steps.filter((s) => s.status === 'COMPLETED').length
    return { steps, done, total: steps.length, pct: steps.length > 0 ? Math.round((done / steps.length) * 100) : 0 }
  }

  function phaseTimeline() {
    return PHASES.map((ph) => {
      const { steps, done, total } = phaseStats(ph.key)
      if (total === 0) return null
      const completed = done === total
      const active = !completed && steps.some((s) => s.status !== 'PENDING')
      return { ...ph, completed, active, done, total }
    }).filter(Boolean)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 shrink-0 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-white font-black text-sm shrink-0`}>
                {emp.photoUrl
                  ? <img src={emp.photoUrl} alt={emp.firstName} className="w-full h-full object-cover rounded-xl" />
                  : initials(emp)}
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">{emp.firstName} {emp.lastName}</h2>
                <p className="text-xs text-slate-500">{emp.position?.title ?? '—'} · {emp.department?.name ?? '—'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Day {days}
                  </span>
                  <span className="text-[11px] text-slate-400">·</span>
                  <span className="text-[11px] font-semibold text-slate-600">{done}/{total} tasks · {pct}%</span>
                  {overdue > 0 && (
                    <span className="text-[11px] font-bold text-red-600 flex items-center gap-0.5">
                      · <AlertCircle className="w-3 h-3" /> {overdue} overdue
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Overall progress bar */}
          <div className="mt-3">
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-[#1A2D42]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Phase timeline */}
          <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-0.5">
            {phaseTimeline().map((ph, i) => (
              <div key={ph!.key} className="flex items-center gap-1 shrink-0">
                {i > 0 && <div className="w-4 h-px bg-slate-200" />}
                <button
                  onClick={() => togglePhase(ph!.key)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors border ${
                    ph!.completed
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : ph!.active
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                >
                  {ph!.completed
                    ? <CheckCircle2 className="w-3 h-3" />
                    : ph!.active
                      ? <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      : <div className="w-2 h-2 rounded-full bg-slate-300" />}
                  {ph!.shortLabel}
                  <span className="text-[10px] opacity-70">{ph!.done}/{ph!.total}</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {PHASES.map((ph) => {
            const { steps, done, total } = phaseStats(ph.key)
            if (total === 0) return null
            const open = expanded.includes(ph.key)
            const hasOverdue = steps.some(isOverdue)

            return (
              <div key={ph.key} className="rounded-xl border border-slate-200 overflow-hidden">
                {/* Phase header */}
                <button
                  onClick={() => togglePhase(ph.key)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <PhasePill phase={ph.key} />
                    <span className="text-xs text-slate-500">{done}/{total} completed</span>
                    {hasOverdue && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${done === total ? 'bg-emerald-500' : 'bg-[#1A2D42]'}`}
                        style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                      />
                    </div>
                    {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                </button>

                {/* Steps */}
                {open && (
                  <div className="divide-y divide-slate-100">
                    {steps.map((step) => {
                      const overdue = isOverdue(step)
                      const owner = stepOwner(step)
                      const isUpdating = updating === step.id
                      const isExpanded = expandedStep === step.id
                      const hasAttachments = ((step.metadata as StepMeta | null)?.attachments?.length ?? 0) > 0
                      const hasResource = !!(step.metadata as StepMeta | null)?.resourceUrl

                      return (
                        <div
                          key={step.id}
                          className={`transition-colors ${
                            overdue ? 'bg-red-50/40' : step.status === 'COMPLETED' ? 'bg-emerald-50/20' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-start gap-3 px-4 py-3">
                            <button
                              onClick={() => toggle(step)}
                              disabled={isUpdating}
                              className="mt-0.5 shrink-0"
                            >
                              {isUpdating
                                ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                                : <StatusDot status={step.status} overdue={overdue} />}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2 justify-between">
                                <button
                                  onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                                  className={`text-left text-sm font-medium leading-snug hover:underline ${step.status === 'COMPLETED' ? 'line-through text-slate-400' : overdue ? 'text-red-700' : 'text-slate-800'}`}
                                >
                                  {step.title}
                                </button>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {(hasAttachments || hasResource) && (
                                    <Paperclip className="w-3 h-3 text-slate-400" />
                                  )}
                                  <OwnerBadge owner={owner} />
                                  <button
                                    onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                                    className="text-slate-400 hover:text-slate-600"
                                  >
                                    {isExpanded
                                      ? <ChevronDown className="w-3.5 h-3.5" />
                                      : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                  {stepIcon(step.stepType)}
                                  {STEP_TYPES.find((t) => t.key === step.stepType)?.label}
                                </span>
                                {step.dueDate && (
                                  <span className={`text-[10px] font-medium ${overdue ? 'text-red-600' : 'text-slate-400'}`}>
                                    {overdue ? '⚠ Overdue · ' : 'Due '}
                                    {new Date(step.dueDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                                {step.completedAt && (
                                  <span className="text-[10px] text-emerald-600">
                                    ✓ {new Date(step.completedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </div>
                              {step.notes && (
                                <p className="text-[11px] text-slate-500 mt-1 italic">{step.notes}</p>
                              )}
                            </div>
                          </div>

                          {/* Attachment panel */}
                          {isExpanded && (
                            <div className="px-4 pb-3">
                              <StepAttachmentPanel
                                step={step}
                                processId={process.id}
                                onSaved={onRefresh}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Template Builder ─────────────────────────────────────────────────────────

type TaskDraft = {
  title: string
  phase: Phase
  ownerType: OwnerType
  stepType: StepType
  dueDaysFromStart: number
  isRequired: boolean
  resourceUrl: string
}

function TemplateBuilder({ onSave, onClose }: { onSave: () => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tasks, setTasks] = useState<TaskDraft[]>([])

  function addTask() {
    setTasks((prev) => [...prev, {
      title: '',
      phase: 'PRE_BOARDING',
      ownerType: 'HR',
      stepType: 'TASK',
      dueDaysFromStart: 0,
      isRequired: true,
      resourceUrl: '',
    }])
  }

  function updateTask(i: number, patch: Partial<TaskDraft>) {
    setTasks((prev) => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t))
  }

  function removeTask(i: number) {
    setTasks((prev) => prev.filter((_, idx) => idx !== i))
  }

  function loadPreset() {
    setName('Philippines Standard Onboarding')
    setDescription('Complete onboarding for Philippine-based employees including all government registrations (SSS, PhilHealth, Pag-IBIG, BIR).')
    setIsDefault(true)
    setTasks(PH_PRESET.map((t) => ({ ...t, resourceUrl: '' })))
  }

  async function save() {
    if (!name.trim()) { toast.error('Template name is required'); return }
    const valid = tasks.filter((t) => t.title.trim())
    if (valid.length === 0) { toast.error('Add at least one task'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description || null, tasks: valid, isDefault }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save template')
      toast.success('Template saved')
      onSave()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="text-base font-black text-slate-900">New Onboarding Template</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name (e.g. Standard PH Onboarding)"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded" />
                Set as default template
              </label>
              <button
                onClick={loadPreset}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" /> Load PH Compliance Preset
              </button>
            </div>
          </div>

          {/* Task list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Tasks ({tasks.length})</p>
              <button
                onClick={addTask}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#1A2D42] text-white hover:bg-[#1A2D42]/90"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Add Task
              </button>
            </div>

            {tasks.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center">
                <p className="text-sm text-slate-400">No tasks yet. Add one or load the PH Preset.</p>
              </div>
            )}

            {tasks.map((task, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <input
                    value={task.title}
                    onChange={(e) => updateTask(i, { title: e.target.value })}
                    placeholder="Task title"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
                  />
                  <button onClick={() => removeTask(i)} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select
                    value={task.phase}
                    onChange={(e) => updateTask(i, { phase: e.target.value as Phase })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none"
                  >
                    {PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                  <select
                    value={task.ownerType}
                    onChange={(e) => updateTask(i, { ownerType: e.target.value as OwnerType })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none"
                  >
                    {OWNER_TYPES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  <select
                    value={task.stepType}
                    onChange={(e) => updateTask(i, { stepType: e.target.value as StepType })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none"
                  >
                    {STEP_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      value={task.dueDaysFromStart}
                      onChange={(e) => updateTask(i, { dueDaysFromStart: Number(e.target.value) })}
                      className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">days in</span>
                  </div>
                </div>
                {/* Resource URL */}
                <div className="flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    value={task.resourceUrl}
                    onChange={(e) => updateTask(i, { resourceUrl: e.target.value })}
                    placeholder="Resource URL (form link, Google Drive, instructions...)"
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={task.isRequired}
                    onChange={(e) => updateTask(i, { isRequired: e.target.checked })}
                    className="rounded"
                  />
                  Required
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── New Process Modal ────────────────────────────────────────────────────────

function NewProcessModal({
  employees, templates, onSave, onClose,
}: {
  employees: EmployeeOption[]
  templates: OnboardingTemplate[]
  onSave: () => void
  onClose: () => void
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [templateId, setTemplateId] = useState(templates.find((t) => t.isDefault)?.id ?? '')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedTemplate = templates.find((t) => t.id === templateId)

  async function save() {
    if (!employeeId) { toast.error('Select an employee'); return }
    if (!templateId) { toast.error('Select a template'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, templateId, notes: notes || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to start onboarding')
      toast.success('Onboarding started')
      onSave()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start onboarding')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">Start Onboarding</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employee *</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Select employee...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName}, {e.firstName} ({e.employeeNo})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Template *</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Select template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (Default)' : ''}</option>
              ))}
            </select>
            {selectedTemplate && (
              <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                <Layers className="w-3 h-3" /> {selectedTemplate.steps.length} tasks across {new Set(selectedTemplate.steps.map((s) => (s.metadata as StepMeta | null)?.phase ?? 'PRE_BOARDING')).size} phases
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any special instructions for this hire..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</> : <><UserPlus className="w-4 h-4" /> Start Onboarding</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OnboardingManager() {
  const [tab, setTab] = useState<'active' | 'templates'>('active')
  const [loading, setLoading] = useState(true)
  const [processes, setProcesses] = useState<OnboardingProcess[]>([])
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [detailProcess, setDetailProcess] = useState<OnboardingProcess | null>(null)
  const [showNewProcess, setShowNewProcess] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProcessStatus | 'ALL'>('ALL')
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null)
  const [deletingProcess, setDeletingProcess] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [pr, tr, er] = await Promise.all([
        fetch('/api/onboarding/processes'),
        fetch('/api/onboarding/templates'),
        fetch('/api/onboarding/employees'),
      ])
      const [pd, td, ed] = await Promise.all([pr.json(), tr.json(), er.json()])
      if (!pr.ok) throw new Error(pd?.error ?? 'Failed to load processes')
      if (!tr.ok) throw new Error(td?.error ?? 'Failed to load templates')
      setProcesses(pd.processes ?? [])
      setTemplates(td.templates ?? [])
      setEmployees(ed.employees ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  // Keep detail view in sync with fresh data
  useEffect(() => {
    if (detailProcess) {
      const fresh = processes.find((p) => p.id === detailProcess.id)
      if (fresh) setDetailProcess(fresh)
    }
  }, [processes])

  async function updateStep(processId: string, stepId: string, status: StepStatus) {
    await fetch(`/api/onboarding/processes/${processId}/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await load()
  }

  async function deleteProcess(id: string) {
    setDeletingProcess(id)
    try {
      const res = await fetch(`/api/onboarding/processes/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Onboarding removed')
      if (detailProcess?.id === id) setDetailProcess(null)
      await load()
    } catch {
      toast.error('Failed to delete onboarding')
    } finally {
      setDeletingProcess(null)
    }
  }

  async function deleteTemplate(id: string) {
    setDeletingTemplate(id)
    try {
      const res = await fetch(`/api/onboarding/templates?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Template removed')
      await load()
    } catch {
      toast.error('Failed to delete template')
    } finally {
      setDeletingTemplate(null)
    }
  }

  // Stats
  const active = processes.filter((p) => p.status === 'IN_PROGRESS' || p.status === 'NOT_STARTED')
  const completed = processes.filter((p) => p.status === 'COMPLETED')
  const totalOverdue = processes.flatMap((p) => p.steps).filter(isOverdue).length
  const avgPct = active.length > 0
    ? Math.round(active.reduce((sum, p) => sum + processProgress(p).pct, 0) / active.length)
    : 0

  // Filtered list
  const filtered = useMemo(() => {
    return processes.filter((p) => {
      const matchStatus = statusFilter === 'ALL' || p.status === statusFilter
      const q = search.toLowerCase()
      const matchSearch = !q || `${p.employee.firstName} ${p.employee.lastName}`.toLowerCase().includes(q)
        || (p.employee.department?.name ?? '').toLowerCase().includes(q)
        || (p.employee.position?.title ?? '').toLowerCase().includes(q)
      return matchStatus && matchSearch
    })
  }, [processes, statusFilter, search])

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Onboarding Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">Manage employee onboarding from pre-boarding to 90-day completion.</p>
        </div>
        <button
          onClick={() => setShowNewProcess(true)}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Start Onboarding
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: active.length, icon: <Clock className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Avg Progress', value: `${avgPct}%`, icon: <Layers className="w-4 h-4" />, color: 'text-teal-600', bg: 'bg-teal-50' },
          { label: 'Overdue Tasks', value: totalOverdue, icon: <AlertCircle className="w-4 h-4" />, color: totalOverdue > 0 ? 'text-red-600' : 'text-slate-500', bg: totalOverdue > 0 ? 'bg-red-50' : 'bg-slate-50' },
          { label: 'Completed', value: completed.length, icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center shrink-0`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-xl font-black text-slate-900">{stat.value}</p>
              <p className="text-xs text-slate-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([['active', 'Active Onboardings'], ['templates', 'Templates']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            {key === 'active' && active.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#1A2D42] text-white">{active.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Active tab */}
      {tab === 'active' && (
        <div className="space-y-4">
          {/* Search & filter */}
          <div className="flex gap-3 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee, position, department..."
              className="flex-1 min-w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProcessStatus | 'ALL')}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none"
            >
              <option value="ALL">All statuses</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="NOT_STARTED">Not Started</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
              <p className="text-sm text-slate-400 mt-2">Loading onboarding list...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500">No onboarding processes found</p>
              <p className="text-xs text-slate-400 mt-1">Click &ldquo;Start Onboarding&rdquo; to add an employee.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((process) => (
                <ProcessCard
                  key={process.id}
                  process={process}
                  onClick={() => setDetailProcess(process)}
                  onDelete={deleteProcess}
                  deleting={deletingProcess === process.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Templates tab */}
      {tab === 'templates' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowBuilder(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90 transition-colors"
            >
              <PlusCircle className="w-4 h-4" /> New Template
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
            </div>
          ) : templates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500">No templates yet</p>
              <p className="text-xs text-slate-400 mt-1">Create a template or load the Philippines compliance preset.</p>
              <button
                onClick={() => setShowBuilder(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90"
              >
                <Sparkles className="w-4 h-4" /> Create Template
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => {
                const phaseCounts = PHASES.map((ph) => ({
                  ...ph,
                  count: t.steps.filter((s) => ((s.metadata as StepMeta | null)?.phase ?? 'PRE_BOARDING') === ph.key).length,
                })).filter((p) => p.count > 0)

                return (
                  <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900">{t.name}</p>
                          {t.isDefault && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#1A2D42] text-white">Default</span>
                          )}
                        </div>
                        {t.description && <p className="text-xs text-slate-500 mt-1">{t.description}</p>}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-xs text-slate-500">{t.steps.length} tasks</span>
                          {phaseCounts.map((p) => (
                            <span key={p.key} className={`text-[11px] px-2 py-0.5 rounded-full ${p.color} ${p.bg}`}>
                              {p.shortLabel}: {p.count}
                            </span>
                          ))}
                        </div>
                        {/* Owner type breakdown */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {OWNER_TYPES.map((o) => {
                            const cnt = t.steps.filter((s) => ((s.metadata as StepMeta | null)?.ownerType ?? 'HR') === o.key).length
                            if (cnt === 0) return null
                            return (
                              <span key={o.key} className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${o.color}`}>
                                {o.label}: {cnt}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteTemplate(t.id)}
                        disabled={deletingTemplate === t.id}
                        className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0"
                      >
                        {deletingTemplate === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals & drawers */}
      {detailProcess && (
        <ProcessDrawer
          process={detailProcess}
          onClose={() => setDetailProcess(null)}
          onStepUpdate={updateStep}
          onRefresh={load}
        />
      )}

      {showNewProcess && (
        <NewProcessModal
          employees={employees}
          templates={templates}
          onSave={async () => { setShowNewProcess(false); await load() }}
          onClose={() => setShowNewProcess(false)}
        />
      )}

      {showBuilder && (
        <TemplateBuilder
          onSave={async () => { setShowBuilder(false); await load() }}
          onClose={() => setShowBuilder(false)}
        />
      )}
    </div>
  )
}
