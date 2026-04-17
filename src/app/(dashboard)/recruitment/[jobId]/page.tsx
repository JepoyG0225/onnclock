'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Briefcase, ChevronRight, Clock, Download, ExternalLink, FileText,
  Link2, Loader2, MapPin, MessageSquare, Phone, Search, Users, Wallet,
  X, Mail, Home, DollarSign, CheckCircle2, UserPlus, ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'FINAL_INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED' | 'WITHDRAWN'

type Application = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  currentAddress: string | null
  expectedSalary: number | null
  resumeUrl: string | null
  coverLetter: string | null
  requirementAnswers: Record<string, string> | null
  stage: Stage
  appliedAt: string
  lastStageUpdatedAt: string | null
  internalNotes: string | null
  source: string
  hiredAt: string | null
  hiredEmployeeId: string | null
}

type Job = {
  id: string
  title: string
  department: string | null
  employmentType: string | null
  workSetup: string | null
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  status: string
  publicApplyToken: string
  applications: Application[]
}

type Department = { id: string; name: string }
type Position = { id: string; title: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES: Stage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN']

const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  FINAL_INTERVIEW: 'Final Interview',
  OFFER: 'Offer Extended',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
}

const STAGE_COLORS: Record<Stage, string> = {
  APPLIED: 'bg-blue-100 text-blue-700',
  SCREENING: 'bg-purple-100 text-purple-700',
  INTERVIEW: 'bg-amber-100 text-amber-700',
  FINAL_INTERVIEW: 'bg-orange-100 text-orange-700',
  OFFER: 'bg-teal-100 text-teal-700',
  HIRED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-600',
  WITHDRAWN: 'bg-slate-100 text-slate-600',
}

const STAGE_DOT: Record<Stage, string> = {
  APPLIED: 'bg-blue-500',
  SCREENING: 'bg-purple-500',
  INTERVIEW: 'bg-amber-500',
  FINAL_INTERVIEW: 'bg-orange-500',
  OFFER: 'bg-teal-500',
  HIRED: 'bg-emerald-500',
  REJECTED: 'bg-red-500',
  WITHDRAWN: 'bg-slate-400',
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarColor(name: string) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[hash]
}

function money(n: number) {
  return `₱${Number(n).toLocaleString('en-PH')}`
}

function initials(app: Application) {
  return `${app.firstName.charAt(0)}${app.lastName.charAt(0)}`.toUpperCase()
}

// ─── Convert to Employee Modal ────────────────────────────────────────────────

function HireModal({
  application,
  departments,
  positions,
  onSuccess,
  onClose,
}: {
  application: Application
  departments: Department[]
  positions: Position[]
  onSuccess: (employeeNo: string) => void
  onClose: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    employeeNo: '',
    gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
    birthDate: '',
    hireDate: today,
    basicSalary: application.expectedSalary ? String(application.expectedSalary) : '',
    employmentStatus: 'PROBATIONARY' as 'PROBATIONARY' | 'REGULAR' | 'CONTRACTUAL' | 'PROJECT_BASED' | 'PART_TIME',
    employmentType: 'FULL_TIME' as 'FULL_TIME' | 'PART_TIME' | 'CONTRACTUAL',
    departmentId: '',
    positionId: '',
  })
  const [saving, setSaving] = useState(false)

  function set(patch: Partial<typeof form>) {
    setForm((p) => ({ ...p, ...patch }))
  }

  async function submit() {
    if (!form.employeeNo.trim()) { toast.error('Employee number is required'); return }
    if (!form.birthDate) { toast.error('Birth date is required'); return }
    const salary = parseFloat(form.basicSalary)
    if (!form.basicSalary || isNaN(salary) || salary <= 0) { toast.error('Enter a valid basic salary'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/recruitment/applications/${application.id}/hire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeNo: form.employeeNo.trim(),
          gender: form.gender,
          birthDate: form.birthDate,
          hireDate: form.hireDate,
          basicSalary: salary,
          employmentStatus: form.employmentStatus,
          employmentType: form.employmentType,
          departmentId: form.departmentId || null,
          positionId: form.positionId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to convert applicant to employee')
      toast.success(`${application.firstName} ${application.lastName} added to the employee list!`)
      onSuccess(data.employee.employeeNo)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to hire')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-black text-slate-900">Convert to Employee</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Creating employee record for{' '}
              <span className="font-semibold text-slate-700">{application.firstName} {application.lastName}</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Pre-filled info notice */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div className="text-xs text-emerald-700 space-y-0.5">
                <p className="font-semibold">Pre-filled from application</p>
                <p>Name, email, phone, and address have been copied from the application. Fill in the required details below to create the employee record.</p>
              </div>
            </div>
          </div>

          {/* Pre-filled summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Name</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{application.firstName} {application.lastName}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Email</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{application.email}</p>
            </div>
          </div>

          {/* Required fields */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Required Information</p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employee No. *</label>
              <input
                value={form.employeeNo}
                onChange={(e) => set({ employeeNo: e.target.value })}
                placeholder="e.g. EMP-001"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Gender *</label>
                <select
                  value={form.gender}
                  onChange={(e) => set({ gender: e.target.value as typeof form.gender })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Birth Date *</label>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => set({ birthDate: e.target.value })}
                  max={today}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Hire Date *</label>
                <input
                  type="date"
                  value={form.hireDate}
                  onChange={(e) => set({ hireDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Basic Salary (₱) *</label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={form.basicSalary}
                  onChange={(e) => set({ basicSalary: e.target.value })}
                  placeholder="e.g. 25000"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                {application.expectedSalary && (
                  <p className="text-[10px] text-slate-400 mt-1">Applicant expected: {money(application.expectedSalary)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Optional fields */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Optional</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employment Status</label>
                <select
                  value={form.employmentStatus}
                  onChange={(e) => set({ employmentStatus: e.target.value as typeof form.employmentStatus })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="PROBATIONARY">Probationary</option>
                  <option value="REGULAR">Regular</option>
                  <option value="CONTRACTUAL">Contractual</option>
                  <option value="PROJECT_BASED">Project-Based</option>
                  <option value="PART_TIME">Part-Time</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employment Type</label>
                <select
                  value={form.employmentType}
                  onChange={(e) => set({ employmentType: e.target.value as typeof form.employmentType })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="FULL_TIME">Full-Time</option>
                  <option value="PART_TIME">Part-Time</option>
                  <option value="CONTRACTUAL">Contractual</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Department</label>
                <select
                  value={form.departmentId}
                  onChange={(e) => set({ departmentId: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">None</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Position</label>
                <select
                  value={form.positionId}
                  onChange={(e) => set({ positionId: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">None</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {saving ? 'Creating Employee...' : 'Create Employee Record'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Resume Tab ───────────────────────────────────────────────────────────────

function ResumeTab({ applicationId, resumeUrl }: { applicationId: string; resumeUrl: string | null }) {
  // Auth-gated route that serves the file with correct Content-Type headers
  const proxyUrl = `/api/recruitment/applications/${applicationId}/resume`
  const isPdf = !!resumeUrl && resumeUrl.toLowerCase().split('?')[0].endsWith('.pdf')
  const fileName = resumeUrl ? resumeUrl.split('/').pop() ?? 'resume' : ''
  const [objError, setObjError] = useState(false)

  if (!resumeUrl) {
    return (
      <div className="px-6 py-12 text-center">
        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-400">No resume uploaded</p>
      </div>
    )
  }

  return (
    <div className="px-6 py-5 space-y-4">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Resume / CV</p>

      {/* Action buttons — always use the auth-gated proxy */}
      <div className="flex gap-2 flex-wrap">
        <a
          href={proxyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90 transition-colors"
        >
          <ExternalLink className="w-4 h-4" /> Open in New Tab
        </a>
        <a
          href={proxyUrl}
          download={fileName}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Download className="w-4 h-4" /> Download
        </a>
      </div>

      {/* Preview */}
      {isPdf ? (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          {/* Header bar */}
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-600 flex-1 truncate">{fileName}</span>
          </div>

          {objError ? (
            /* Fallback when the browser blocks <object> (rare) */
            <div className="bg-slate-50 p-8 text-center">
              <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600 mb-1">Preview unavailable</p>
              <p className="text-xs text-slate-400 mb-4">Your browser couldn&apos;t render the PDF inline.</p>
              <a
                href={proxyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90"
              >
                <ExternalLink className="w-4 h-4" /> Open PDF
              </a>
            </div>
          ) : (
            /*
             * <object> is the most cross-browser way to embed PDFs.
             * It respects Content-Type from the server and renders inline
             * in Chrome, Edge, Firefox, and Safari (desktop).
             * The inner <p> is shown by browsers that can't display PDFs.
             */
            <object
              data={proxyUrl}
              type="application/pdf"
              className="w-full block"
              style={{ height: '68vh', minHeight: 400 }}
              onError={() => setObjError(true)}
              aria-label="PDF resume preview"
            >
              {/* Fallback content for browsers that surface the inner DOM */}
              <div className="bg-slate-50 p-8 text-center">
                <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600 mb-1">Your browser can&apos;t display PDFs inline.</p>
                <a
                  href={proxyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90"
                >
                  <ExternalLink className="w-4 h-4" /> Open in New Tab
                </a>
              </div>
            </object>
          )}
        </div>
      ) : (
        /* DOC / DOCX — no inline preview possible, just show download card */
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
          <FileText className="w-10 h-10 text-blue-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700 mb-1">{fileName}</p>
          <p className="text-xs text-slate-400 mb-4">Word documents can&apos;t be previewed inline. Download to view.</p>
          <a
            href={proxyUrl}
            download={fileName}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90"
          >
            <Download className="w-4 h-4" /> Download File
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Application Detail Drawer ────────────────────────────────────────────────

type DrawerTab = 'overview' | 'cover_letter' | 'resume' | 'qa'

function ApplicationDrawer({
  application: initialApp,
  departments,
  positions,
  autoOpenHire,
  onClose,
  onUpdate,
}: {
  application: Application
  departments: Department[]
  positions: Position[]
  autoOpenHire?: boolean
  onClose: () => void
  onUpdate: (updated: Partial<Application> & { id: string }) => void
}) {
  const [app, setApp] = useState(initialApp)
  const [tab, setTab] = useState<DrawerTab>('overview')
  const [notes, setNotes] = useState(initialApp.internalNotes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [updatingStage, setUpdatingStage] = useState(false)
  const [showHireModal, setShowHireModal] = useState(autoOpenHire ?? false)

  const isHired = app.stage === 'HIRED' && !!app.hiredEmployeeId
  const canConvert = !isHired && !['REJECTED', 'WITHDRAWN'].includes(app.stage)
  const hasRequirementAnswers =
    app.requirementAnswers && Object.keys(app.requirementAnswers).length > 0

  const tabs: { key: DrawerTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'overview', label: 'Overview', icon: <Users className="w-3.5 h-3.5" />, show: true },
    { key: 'cover_letter', label: 'Cover Letter', icon: <MessageSquare className="w-3.5 h-3.5" />, show: !!app.coverLetter },
    { key: 'resume', label: 'Resume / CV', icon: <FileText className="w-3.5 h-3.5" />, show: !!app.resumeUrl },
    { key: 'qa', label: 'Q&A', icon: <ClipboardList className="w-3.5 h-3.5" />, show: !!hasRequirementAnswers },
  ]

  async function updateStage(stage: Stage) {
    if (stage === 'HIRED' && !app.hiredEmployeeId) {
      setShowHireModal(true)
      return
    }
    setUpdatingStage(true)
    try {
      const res = await fetch(`/api/recruitment/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error ?? 'Failed') }
      const updated = { ...app, stage }
      setApp(updated)
      onUpdate({ id: app.id, stage })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update stage')
    } finally {
      setUpdatingStage(false)
    }
  }

  async function saveNotes() {
    setSavingNotes(true)
    try {
      const res = await fetch(`/api/recruitment/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNotes: notes }),
      })
      if (!res.ok) throw new Error('Failed to save notes')
      onUpdate({ id: app.id, internalNotes: notes })
      toast.success('Notes saved')
    } catch {
      toast.error('Failed to save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  function handleHireSuccess(employeeNo: string) {
    const updated = { ...app, stage: 'HIRED' as Stage, hiredAt: new Date().toISOString() }
    setApp(updated)
    onUpdate({ id: app.id, stage: 'HIRED', hiredAt: updated.hiredAt })
    setShowHireModal(false)
    toast.success(`Employee record created (${employeeNo}). Onboarding auto-started.`)
  }

  const aColor = avatarColor(app.firstName + app.lastName)

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${aColor}`}>
                  {initials(app)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black text-slate-900 truncate">
                    {app.firstName} {app.lastName}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${STAGE_COLORS[app.stage]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[app.stage]}`} />
                      {STAGE_LABELS[app.stage]}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Applied {new Date(app.appliedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stage change row */}
            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs text-slate-500 font-medium shrink-0">Move to:</label>
              <div className="relative flex-1">
                <select
                  value={app.stage}
                  onChange={(e) => updateStage(e.target.value as Stage)}
                  disabled={updatingStage || isHired}
                  className={`w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-300 appearance-none pr-7 ${STAGE_COLORS[app.stage]} disabled:opacity-60 disabled:cursor-default`}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                  ))}
                </select>
                {updatingStage && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-current" />
                )}
              </div>
              {/* Convert to Employee button */}
              {canConvert && (
                <button
                  onClick={() => setShowHireModal(true)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Hire
                </button>
              )}
              {isHired && (
                <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Employee Created
                </span>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 shrink-0 px-4 gap-1 overflow-x-auto">
            {tabs.filter((t) => t.show).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? 'border-[#1A2D42] text-[#1A2D42]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">

            {/* Overview */}
            {tab === 'overview' && (
              <div className="px-6 py-5 space-y-5">
                {/* Contact info */}
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Contact Information</p>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400">Email</p>
                        <a href={`mailto:${app.email}`} className="text-sm text-slate-800 hover:text-blue-600 hover:underline truncate block">
                          {app.email}
                        </a>
                      </div>
                    </div>
                    {app.phone && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <Phone className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Phone</p>
                          <p className="text-sm text-slate-800">{app.phone}</p>
                        </div>
                      </div>
                    )}
                    {app.currentAddress && (
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                          <Home className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Current Address</p>
                          <p className="text-sm text-slate-800 leading-relaxed">{app.currentAddress}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Application info */}
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Application Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    {app.expectedSalary != null && (
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                          <DollarSign className="w-3 h-3" /> Expected Salary
                        </p>
                        <p className="text-sm font-bold text-emerald-700">{money(app.expectedSalary)}</p>
                      </div>
                    )}
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                        <Clock className="w-3 h-3" /> Applied
                      </p>
                      <p className="text-sm font-semibold text-slate-800">
                        {new Date(app.appliedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 mb-0.5">Source</p>
                      <p className="text-sm font-semibold text-slate-800">{app.source.replace(/_/g, ' ')}</p>
                    </div>
                    {app.hiredAt && (
                      <div className="bg-emerald-50 rounded-xl p-3">
                        <p className="text-[10px] text-emerald-600 mb-0.5">Hired On</p>
                        <p className="text-sm font-bold text-emerald-700">
                          {new Date(app.hiredAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Quick links */}
                {(app.resumeUrl || app.coverLetter) && (
                  <section>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Quick Access</p>
                    <div className="flex flex-wrap gap-2">
                      {app.resumeUrl && (
                        <button
                          onClick={() => setTab('resume')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" /> View Resume
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                      {app.coverLetter && (
                        <button
                          onClick={() => setTab('cover_letter')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Cover Letter
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                      {hasRequirementAnswers && (
                        <button
                          onClick={() => setTab('qa')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
                        >
                          <ClipboardList className="w-3.5 h-3.5" /> Q&A Answers
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </section>
                )}

                {/* Internal Notes */}
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Internal Notes</p>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Add private notes for HR team (not visible to applicant)..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={saveNotes}
                      disabled={savingNotes || notes === (app.internalNotes ?? '')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90 disabled:opacity-50 transition-colors"
                    >
                      {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Save Notes
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* Cover Letter */}
            {tab === 'cover_letter' && (
              <div className="px-6 py-5">
                {app.coverLetter ? (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">Cover Letter</p>
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-[inherit]">
                        {app.coverLetter}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">No cover letter submitted</p>
                  </div>
                )}
              </div>
            )}

            {/* Resume / CV */}
            {tab === 'resume' && (
              <ResumeTab applicationId={app.id} resumeUrl={app.resumeUrl} />
            )}

            {/* Q&A */}
            {tab === 'qa' && (
              <div className="px-6 py-5 space-y-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Application Q&A</p>
                {hasRequirementAnswers ? (
                  <div className="space-y-3">
                    {Object.entries(app.requirementAnswers ?? {}).map(([q, a]) => (
                      <div key={q} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                        <p className="text-xs font-bold text-slate-700 mb-1.5">{q}</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{a || <em className="text-slate-400">No answer provided</em>}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">No Q&A submitted</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hire modal — rendered over the drawer */}
      {showHireModal && (
        <HireModal
          application={app}
          departments={departments}
          positions={positions}
          onSuccess={handleHireSuccess}
          onClose={() => setShowHireModal(false)}
        />
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecruitmentJobDetailPage() {
  const params = useParams<{ jobId: string }>()
  const jobId = params?.jobId
  const [job, setJob] = useState<Job | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<Stage | 'ALL'>('ALL')
  const [loading, setLoading] = useState(true)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [autoOpenHire, setAutoOpenHire] = useState(false)

  function openDrawer(app: Application, hireNow = false) {
    setSelectedApp(app)
    setAutoOpenHire(hireNow)
  }

  function closeDrawer() {
    setSelectedApp(null)
    setAutoOpenHire(false)
  }

  const shareUrl = useMemo(() => {
    if (!job?.publicApplyToken || typeof window === 'undefined') return ''
    return `${window.location.origin}/apply/${job.publicApplyToken}`
  }, [job?.publicApplyToken])

  useEffect(() => {
    if (!jobId) return
    let active = true
    setLoading(true)
    Promise.all([
      fetch(`/api/recruitment/jobs/${jobId}`).then((r) => r.json()),
      fetch('/api/departments').then((r) => r.json()),
      fetch('/api/positions').then((r) => r.json()),
    ])
      .then(([jobPayload, deptPayload, posPayload]) => {
        if (!active) return
        setJob(jobPayload.job)
        setApplications(jobPayload.job?.applications ?? [])
        setDepartments(deptPayload.departments ?? [])
        setPositions(posPayload.positions ?? [])
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [jobId])

  function handleAppUpdate(updated: Partial<Application> & { id: string }) {
    setApplications((apps) =>
      apps.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
    )
    setSelectedApp((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev))
  }

  const stageCounts = useMemo(() => {
    const counts: Partial<Record<Stage, number>> = {}
    for (const app of applications) {
      counts[app.stage] = (counts[app.stage] ?? 0) + 1
    }
    return counts
  }, [applications])

  const filtered = useMemo(() => {
    return applications.filter((app) => {
      if (stageFilter !== 'ALL' && app.stage !== stageFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          `${app.firstName} ${app.lastName}`.toLowerCase().includes(q) ||
          app.email.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [applications, stageFilter, search])

  const activeStages: Stage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'HIRED']
  const endStages: Stage[] = ['REJECTED', 'WITHDRAWN']

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
        <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/recruitment" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3 font-medium">
            <ArrowLeft className="w-3 h-3" /> Back to Recruitment
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-slate-900">{job?.title ?? 'Job Post'}</h1>
            {job?.status && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                job.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' :
                job.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {job.status === 'OPEN' ? 'Active' : job.status === 'DRAFT' ? 'Draft' : 'Closed'}
              </span>
            )}
          </div>
          {job && (
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {job.department && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Briefcase className="w-3 h-3" /> {job.department}
                </span>
              )}
              {job.location && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="w-3 h-3" /> {job.location}
                </span>
              )}
              {(job.salaryMin != null || job.salaryMax != null) && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                  <Wallet className="w-3 h-3" />
                  {job.salaryMin != null && job.salaryMax != null
                    ? `${money(job.salaryMin)} – ${money(job.salaryMax)}`
                    : job.salaryMin != null ? `${money(job.salaryMin)}+` : `Up to ${money(job.salaryMax ?? 0)}`}
                </span>
              )}
              {job.employmentType && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 font-medium">{job.employmentType}</span>
              )}
              {job.workSetup && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-teal-50 text-teal-700 font-medium">{job.workSetup}</span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success('Apply link copied') }}
          className="shrink-0 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Link2 className="w-3.5 h-3.5" /> Copy Apply Link
        </button>
      </div>

      {/* Pipeline overview */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          Pipeline &mdash; {applications.length} total applicant{applications.length !== 1 ? 's' : ''}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {activeStages.map((stage) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stageFilter === stage ? 'ALL' : stage)}
              className={`rounded-xl border p-3 text-center transition-all ${
                stageFilter === stage
                  ? 'ring-2 ring-offset-1 ring-slate-400 border-slate-300 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <p className={`text-lg font-black ${stageCounts[stage] ? 'text-slate-900' : 'text-slate-300'}`}>
                {stageCounts[stage] ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">{STAGE_LABELS[stage]}</p>
            </button>
          ))}
        </div>
        {endStages.some((s) => (stageCounts[s] ?? 0) > 0) && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
            {endStages.map((stage) => (
              <button
                key={stage}
                onClick={() => setStageFilter(stageFilter === stage ? 'ALL' : stage)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${STAGE_COLORS[stage]} ${stageFilter === stage ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[stage]}`} />
                {STAGE_LABELS[stage]}: {stageCounts[stage] ?? 0}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search applicants..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
          />
        </div>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as Stage | 'ALL')}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white text-slate-700"
        >
          <option value="ALL">All Stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
        {(search || stageFilter !== 'ALL') && (
          <button
            onClick={() => { setSearch(''); setStageFilter('ALL') }}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium"
          >
            Clear
          </button>
        )}
      </div>

      {/* Applicants table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">
              {applications.length === 0
                ? 'No applications yet'
                : `No applicants in ${stageFilter !== 'ALL' ? STAGE_LABELS[stageFilter as Stage] : 'this view'}`}
            </p>
            {applications.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">Share the apply link to start receiving applications</p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Applicant</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Applied</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Stage</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((app) => {
                const aColor = avatarColor(app.firstName + app.lastName)
                const hasFiles = !!(app.resumeUrl || app.coverLetter)
                const isAlreadyHired = app.stage === 'HIRED' && !!app.hiredEmployeeId
                return (
                  <tr
                    key={app.id}
                    onClick={() => openDrawer(app)}
                    className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${aColor}`}>
                          {initials(app)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 group-hover:text-[#1A2D42]">
                            {app.firstName} {app.lastName}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-slate-500 sm:hidden">{app.email}</p>
                            {hasFiles && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 sm:flex hidden">
                                <FileText className="w-2.5 h-2.5" />
                                {app.resumeUrl && app.coverLetter ? 'CV + Letter' : app.resumeUrl ? 'CV' : 'Letter'}
                              </span>
                            )}
                            {isAlreadyHired && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-semibold">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Employee
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-slate-600">{app.email}</p>
                      {app.phone && <p className="text-xs text-slate-400 mt-0.5">{app.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                      {new Date(app.appliedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={app.stage}
                        onChange={(e) => {
                          const next = e.target.value as Stage
                          // HIRED without employee record → open drawer with hire modal
                          if (next === 'HIRED' && !app.hiredEmployeeId) {
                            openDrawer(app, true)
                            return
                          }
                          const prev = app.stage
                          handleAppUpdate({ id: app.id, stage: next })
                          fetch(`/api/recruitment/applications/${app.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ stage: next }),
                          }).then((r) => {
                            if (!r.ok) {
                              toast.error('Failed to update stage')
                              handleAppUpdate({ id: app.id, stage: prev })
                            }
                          })
                        }}
                        className={`rounded-lg border-0 px-2.5 py-1.5 text-xs font-semibold cursor-pointer focus:ring-2 focus:ring-offset-1 focus:ring-slate-300 ${STAGE_COLORS[app.stage]}`}
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Application detail drawer */}
      {selectedApp && (
        <ApplicationDrawer
          key={selectedApp.id}
          application={selectedApp}
          departments={departments}
          positions={positions}
          autoOpenHire={autoOpenHire}
          onClose={closeDrawer}
          onUpdate={handleAppUpdate}
        />
      )}
    </div>
  )
}
