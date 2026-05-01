'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Briefcase, Link2, Pencil, Plus, RefreshCw, Users, MapPin, Clock,
  ChevronRight, X, Loader2, Eye, EyeOff, Trash2, Search, Building2,
  TrendingUp, CheckCircle, FileText, Wallet, Settings2,
  ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'
import NewFeatureBadge from '@/components/ui/NewFeatureBadge'
import { format } from 'date-fns'

type Job = {
  id: string
  title: string
  description?: string | null
  requirements?: string[] | null
  benefits?: string[] | null
  department: string | null
  location?: string | null
  employmentType?: string | null
  workSetup?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  visibility: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
  publicApplyToken: string
  createdAt: string
  _count: { applications: number }
}

type Department = { id: string; name: string }

const emptyForm = {
  title: '',
  description: '',
  requirementsText: '',
  benefitsText: '',
  department: '',
  location: '',
  employmentType: '',
  workSetup: '',
  salaryMin: '',
  salaryMax: '',
  visibility: 'DRAFT' as 'DRAFT' | 'PUBLISHED',
}

const TYPE_COLORS: Record<string, string> = {
  'Full-time':    'bg-blue-50 text-blue-700 border-blue-100',
  'Part-time':    'bg-purple-50 text-purple-700 border-purple-100',
  'Contractual':  'bg-orange-50 text-orange-700 border-orange-100',
  'Project-based':'bg-amber-50 text-amber-700 border-amber-100',
  'Internship':   'bg-pink-50 text-pink-700 border-pink-100',
}
const SETUP_COLORS: Record<string, string> = {
  'Remote':  'bg-green-50 text-green-700 border-green-100',
  'Hybrid':  'bg-teal-50 text-teal-700 border-teal-100',
  'On-site': 'bg-slate-50 text-slate-700 border-slate-200',
}

const STATUS_CONFIG = {
  PUBLISHED: { label: 'Active',  dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  DRAFT:     { label: 'Draft',   dot: 'bg-amber-400',   pill: 'bg-amber-50  text-amber-700  border-amber-200'  },
  CLOSED:    { label: 'Closed',  dot: 'bg-slate-400',   pill: 'bg-slate-100 text-slate-600  border-slate-200'  },
}

function money(n: number) {
  return `Php ${Number(n).toLocaleString('en-PH')}`
}

function JobFormFields({
  form,
  setForm,
  departments,
}: {
  form: typeof emptyForm
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>
  departments: Department[]
}) {
  const field = 'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#2E4156] focus:ring-1 focus:ring-[#2E4156]/20 placeholder:text-slate-400'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Job Title *</label>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Senior Software Engineer" className={field} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Department</label>
          <select value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className={field}>
            <option value="">Select department</option>
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Location</label>
          <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
            placeholder="e.g. Makati City, Metro Manila" className={field} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Employment Type</label>
          <select value={form.employmentType} onChange={e => setForm(p => ({ ...p, employmentType: e.target.value }))} className={field}>
            <option value="">Select type</option>
            {['Full-time','Part-time','Contractual','Project-based','Internship'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Work Setup</label>
          <select value={form.workSetup} onChange={e => setForm(p => ({ ...p, workSetup: e.target.value }))} className={field}>
            <option value="">Select setup</option>
            {['On-site','Remote','Hybrid'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Min Salary (Php)</label>
          <input type="number" min="0" value={form.salaryMin} onChange={e => setForm(p => ({ ...p, salaryMin: e.target.value }))}
            placeholder="e.g. 25000" className={field} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Max Salary (Php)</label>
          <input type="number" min="0" value={form.salaryMax} onChange={e => setForm(p => ({ ...p, salaryMax: e.target.value }))}
            placeholder="e.g. 45000" className={field} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Job Description *</label>
        <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="Describe the role, responsibilities, and day-to-day activities..."
          rows={5} className={field + ' resize-none'} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Requirements</label>
        <p className="text-xs text-slate-400 mb-1.5">One item per line</p>
        <textarea value={form.requirementsText} onChange={e => setForm(p => ({ ...p, requirementsText: e.target.value }))}
          placeholder={"Bachelor's degree in relevant field\n3+ years experience\nProficiency in MS Office"}
          rows={4} className={field + ' resize-none'} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Benefits</label>
        <p className="text-xs text-slate-400 mb-1.5">One item per line</p>
        <textarea value={form.benefitsText} onChange={e => setForm(p => ({ ...p, benefitsText: e.target.value }))}
          placeholder={"HMO on Day 1\n13th Month Pay\nFlexible work arrangement"}
          rows={4} className={field + ' resize-none'} />
      </div>
    </div>
  )
}

export default function RecruitmentPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [entitled, setEntitled] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tab, setTab] = useState<'ALL' | 'PUBLISHED' | 'DRAFT' | 'CLOSED'>('ALL')
  const [search, setSearch] = useState('')
  const [analytics, setAnalytics] = useState({
    totalApplications: 0,
    interviewed: 0,
    hired: 0,
    conversionRate: 0,
    avgTimeToHireDays: 0,
  })

  const shareOrigin = useMemo(() => (typeof window !== 'undefined' ? window.location.origin : ''), [])

  async function loadJobs() {
    setLoading(true)
    try {
      const res = await fetch('/api/recruitment/jobs')
      const data = await res.json()
      if (res.status === 403) { setEntitled(false); setJobs([]); return }
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load jobs')
      setEntitled(true)
      setJobs(data.jobs ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load jobs')
    } finally { setLoading(false) }
  }

  async function loadDepartments() {
    try {
      const res = await fetch('/api/departments')
      const data = await res.json()
      if (res.ok) setDepartments(data.departments ?? [])
    } catch { /* ignore */ }
  }

  useEffect(() => { void loadJobs(); void loadDepartments() }, [])
  useEffect(() => {
    let mounted = true
    async function loadAnalytics() {
      try {
        const res = await fetch('/api/recruitment/analytics')
        const data = await res.json().catch(() => ({}))
        if (!mounted || !res.ok || !data?.totals) return
        setAnalytics(data.totals)
      } catch {
        // silent
      }
    }
    void loadAnalytics()
    return () => { mounted = false }
  }, [])

  async function createJob() {
    if (!form.title.trim() || !form.description.trim()) return toast.error('Title and description are required')
    if (form.salaryMin && form.salaryMax && Number(form.salaryMax) < Number(form.salaryMin)) return toast.error('Max salary must be >= min salary')
    setSaving(true)
    try {
      const body = {
        title: form.title, description: form.description,
        requirements: form.requirementsText.split('\n').map(l => l.trim()).filter(Boolean),
        benefits: form.benefitsText.split('\n').map(l => l.trim()).filter(Boolean),
        department: form.department || null, location: form.location || null,
        employmentType: form.employmentType || null, workSetup: form.workSetup || null,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
        visibility: form.visibility,
      }
      const res = await fetch('/api/recruitment/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to create job')
      toast.success('Job post created')
      setForm(emptyForm)
      setDrawerOpen(false)
      await loadJobs()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to create job') }
    finally { setSaving(false) }
  }

  async function saveEdits() {
    if (!editingJobId) return
    if (!editForm.title.trim() || !editForm.description.trim()) return toast.error('Title and description are required')
    setEditSaving(true)
    try {
      const body = {
        title: editForm.title, description: editForm.description,
        requirements: editForm.requirementsText.split('\n').map(l => l.trim()).filter(Boolean),
        benefits: editForm.benefitsText.split('\n').map(l => l.trim()).filter(Boolean),
        department: editForm.department || null, location: editForm.location || null,
        employmentType: editForm.employmentType || null, workSetup: editForm.workSetup || null,
        salaryMin: editForm.salaryMin ? Number(editForm.salaryMin) : null,
        salaryMax: editForm.salaryMax ? Number(editForm.salaryMax) : null,
        visibility: editForm.visibility,
      }
      const res = await fetch(`/api/recruitment/jobs/${editingJobId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to update job')
      toast.success('Job post updated')
      setEditingJobId(null)
      await loadJobs()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to update job') }
    finally { setEditSaving(false) }
  }

  async function updateVisibility(jobId: string, visibility: 'DRAFT' | 'PUBLISHED' | 'CLOSED') {
    try {
      const res = await fetch(`/api/recruitment/jobs/${jobId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility }) })
      if (!res.ok) throw new Error('Failed to update')
      toast.success(visibility === 'PUBLISHED' ? 'Job published' : visibility === 'CLOSED' ? 'Job closed' : 'Reverted to draft')
      await loadJobs()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to update') }
  }

  async function deleteJob(jobId: string) {
    try {
      const res = await fetch(`/api/recruitment/jobs/${jobId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmText: deleteConfirmText }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to delete')
      toast.success('Job post deleted')
      setDeletingJobId(null); setDeleteConfirmText('')
      await loadJobs()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to delete') }
  }

  const filteredJobs = useMemo(() => {
    let list = jobs
    if (tab !== 'ALL') list = list.filter(j => j.visibility === tab)
    if (search.trim()) list = list.filter(j => j.title.toLowerCase().includes(search.toLowerCase()) || (j.department ?? '').toLowerCase().includes(search.toLowerCase()))
    return list
  }, [jobs, tab, search])

  const stats = useMemo(() => ({
    active:     jobs.filter(j => j.visibility === 'PUBLISHED').length,
    draft:      jobs.filter(j => j.visibility === 'DRAFT').length,
    closed:     jobs.filter(j => j.visibility === 'CLOSED').length,
    applicants: jobs.reduce((s, j) => s + j._count.applications, 0),
  }), [jobs])

  const deletingJob = jobs.find(j => j.id === deletingJobId) ?? null
  const editingJob  = jobs.find(j => j.id === editingJobId)  ?? null

  if (!entitled) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <Briefcase className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-xl font-black text-amber-900">Recruitment is a Pro Feature</h1>
          <p className="text-sm text-amber-800 mt-2 max-w-md mx-auto">Upgrade to the Php 70/seat plan to unlock recruitment, onboarding, performance reviews, and more.</p>
          <Link href="/settings/billing" className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700">
            Upgrade Now
          </Link>
        </div>
      </div>
    )
  }

  const TABS: { key: typeof tab; label: string; count: number }[] = [
    { key: 'ALL',       label: 'All Jobs', count: jobs.length },
    { key: 'PUBLISHED', label: 'Active',   count: stats.active },
    { key: 'DRAFT',     label: 'Drafts',   count: stats.draft },
    { key: 'CLOSED',    label: 'Closed',   count: stats.closed },
  ]

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Job Postings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage open roles, share links, track applicants, and monitor pipeline analytics</p>
          <div className="mt-1">
            <NewFeatureBadge releasedAt="2026-05-01T00:00:00+08:00" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadJobs} disabled={loading}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/recruitment/settings"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">
            <Settings2 className="w-4 h-4" /> Career Page
          </Link>
          <Link href="/recruitment/templates"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">
            <FileText className="w-4 h-4" /> Email Templates
          </Link>
          <button onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#2E4156] shadow-sm">
            <Plus className="w-4 h-4" /> Post a Job
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: TrendingUp,   label: 'Active Postings',   value: stats.active,     color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { icon: FileText,     label: 'Draft Postings',    value: stats.draft,      color: 'text-amber-600',   bg: 'bg-amber-50'   },
          { icon: Users,        label: 'Total Applicants',  value: stats.applicants, color: 'text-blue-600',    bg: 'bg-blue-50'    },
          { icon: CheckCircle,  label: 'Closed Postings',   value: stats.closed,     color: 'text-slate-500',   bg: 'bg-slate-100'  },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${s.bg}`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-2xl font-black text-slate-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Applications', value: analytics.totalApplications, icon: ClipboardList, tone: 'text-indigo-600 bg-indigo-50' },
          { label: 'Interviewed', value: analytics.interviewed, icon: Users, tone: 'text-violet-600 bg-violet-50' },
          { label: 'Hired', value: analytics.hired, icon: CheckCircle, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Conversion Rate', value: `${analytics.conversionRate}%`, icon: TrendingUp, tone: 'text-fuchsia-600 bg-fuchsia-50' },
        ].map(item => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`inline-flex rounded-lg p-2 ${item.tone}`}>
              <item.icon className="h-4 w-4" />
            </div>
            <p className="mt-2 text-xs text-slate-500">{item.label}</p>
            <p className="text-xl font-black text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 p-4 text-white shadow-md">
        <p className="text-xs uppercase tracking-wide text-slate-200">Pipeline Insight</p>
        <p className="mt-1 text-sm">
          Average time-to-hire is <strong>{analytics.avgTimeToHireDays} days</strong> based on hired applicants.
        </p>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === t.key ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-500'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search job title or department..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#2E4156]" />
        </div>
      </div>

      {/* Job Cards */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-14 text-center">
          <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">{jobs.length === 0 ? 'No job posts yet. Click "Post a Job" to get started.' : 'No jobs match your filter.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map(job => {
            const cfg = STATUS_CONFIG[job.visibility]
            return (
              <div key={job.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left: job info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.pill}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      <h3 className="text-base font-bold text-slate-900">{job.title}</h3>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {job.department && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
                          <Building2 className="w-3 h-3" /> {job.department}
                        </span>
                      )}
                      {job.location && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
                          <MapPin className="w-3 h-3" /> {job.location}
                        </span>
                      )}
                      {job.employmentType && (
                        <span className={`inline-flex items-center gap-1 text-xs rounded-full border px-2.5 py-1 font-medium ${TYPE_COLORS[job.employmentType] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          <Clock className="w-3 h-3" /> {job.employmentType}
                        </span>
                      )}
                      {job.workSetup && (
                        <span className={`inline-flex items-center gap-1 text-xs rounded-full border px-2.5 py-1 font-medium ${SETUP_COLORS[job.workSetup] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {job.workSetup}
                        </span>
                      )}
                      {(job.salaryMin != null || job.salaryMax != null) && (
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-1 font-semibold">
                          <Wallet className="w-3 h-3" />
                          {job.salaryMin != null && job.salaryMax != null
                            ? `${money(job.salaryMin)} – ${money(job.salaryMax)}`
                            : job.salaryMin != null ? `${money(job.salaryMin)}+`
                            : `Up to ${money(job.salaryMax ?? 0)}`}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> {job._count.applications} applicant{job._count.applications !== 1 ? 's' : ''}
                      </span>
                      <span>Posted {format(new Date(job.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    <Link href={`/recruitment/${job.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Users className="w-3.5 h-3.5" /> Applicants
                      {job._count.applications > 0 && (
                        <span className="w-5 h-5 rounded-full bg-[#1A2D42] text-white text-[10px] font-bold flex items-center justify-center">
                          {job._count.applications > 99 ? '99+' : job._count.applications}
                        </span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                    </Link>

                    <button onClick={() => { navigator.clipboard.writeText(`${shareOrigin}/apply/${job.publicApplyToken}`); toast.success('Link copied') }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      <Link2 className="w-3.5 h-3.5" /> Copy Link
                    </button>

                    <button onClick={() => {
                      setEditingJobId(job.id)
                      setEditForm({
                        title: job.title ?? '', description: job.description ?? '',
                        requirementsText: (job.requirements ?? []).join('\n'),
                        benefitsText: (job.benefits ?? []).join('\n'),
                        department: job.department ?? '', location: job.location ?? '',
                        employmentType: job.employmentType ?? '', workSetup: job.workSetup ?? '',
                        salaryMin: job.salaryMin != null ? String(job.salaryMin) : '',
                        salaryMax: job.salaryMax != null ? String(job.salaryMax) : '',
                        visibility: job.visibility === 'CLOSED' ? 'DRAFT' : job.visibility,
                      })
                    }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {job.visibility !== 'PUBLISHED' && (
                      <button onClick={() => updateVisibility(job.id, 'PUBLISHED')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">
                        <Eye className="w-3.5 h-3.5" /> Publish
                      </button>
                    )}
                    {job.visibility === 'PUBLISHED' && (
                      <button onClick={() => updateVisibility(job.id, 'CLOSED')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        <EyeOff className="w-3.5 h-3.5" /> Close
                      </button>
                    )}

                    <button onClick={() => { setDeletingJobId(job.id); setDeleteConfirmText('') }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Job Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-black text-slate-900">Post a New Job</h2>
                <p className="text-xs text-slate-400 mt-0.5">Fill in the job details and publish when ready</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 px-6 py-5">
              <JobFormFields form={form} setForm={setForm} departments={departments} />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Posting Status</label>
                <select value={form.visibility} onChange={e => setForm(p => ({ ...p, visibility: e.target.value as 'DRAFT' | 'PUBLISHED' }))}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white w-full focus:outline-none focus:border-[#2E4156]">
                  <option value="DRAFT">Save as Draft</option>
                  <option value="PUBLISHED">Publish Now</option>
                </select>
              </div>
              <button onClick={() => setDrawerOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 mt-5">
                Cancel
              </button>
              <button onClick={createJob} disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#2E4156] disabled:opacity-60 flex items-center gap-2 mt-5">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Plus className="w-4 h-4" /> Create Job</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingJob && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setEditingJobId(null)} />
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-black text-slate-900">Edit Job Post</h2>
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{editingJob.title}</p>
              </div>
              <button onClick={() => setEditingJobId(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 px-6 py-5">
              <JobFormFields form={editForm} setForm={setEditForm} departments={departments} />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Posting Status</label>
                <select value={editForm.visibility} onChange={e => setEditForm(p => ({ ...p, visibility: e.target.value as 'DRAFT' | 'PUBLISHED' }))}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white w-full focus:outline-none focus:border-[#2E4156]">
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                </select>
              </div>
              <button onClick={() => setEditingJobId(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 mt-5">
                Cancel
              </button>
              <button onClick={saveEdits} disabled={editSaving}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] disabled:opacity-60 flex items-center gap-2 mt-5">
                {editSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingJob && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Delete Job Post</h3>
            <p className="text-sm text-slate-500 mt-1">
              You are deleting <span className="font-semibold text-slate-800">{deletingJob.title}</span>. This will also remove all associated applications.
            </p>
            <p className="text-xs text-red-600 mt-3 font-medium">Type <strong>DELETE</strong> to confirm</p>
            <input autoFocus value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE" className="mt-2 w-full rounded-xl border border-red-200 px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setDeletingJobId(null); setDeleteConfirmText('') }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Cancel</button>
              <button onClick={() => deleteJob(deletingJob.id)} disabled={deleteConfirmText.toUpperCase() !== 'DELETE'}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 disabled:opacity-40">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
