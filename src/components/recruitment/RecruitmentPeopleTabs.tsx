'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock3, LayoutGrid, List, Mail,
  Plus, Save, Search, SlidersHorizontal, Trash2, UsersRound, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppSpinner } from '@/components/ui/AppSpinner'

type Stage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'FINAL_INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED' | 'WITHDRAWN'
type PipelineStage = { id: string; name: string; color: string; category: Stage; order: number; isDefault: boolean }

type Candidate = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  source: string | null
  stage: Stage
  appliedAt: string
  lastStageUpdatedAt: string
  expectedSalary: number | null
  resumeUrl: string | null
  hiredEmployeeId: string | null
  pipelineStageId: string | null
  pipelineStage: PipelineStage | null
  jobPost: { id: string; title: string; department: string | null; location: string | null }
}

const STAGES: Stage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN']
const TERMINAL_STAGES: Stage[] = ['HIRED', 'REJECTED', 'WITHDRAWN']
const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: 'Applied', SCREENING: 'Screening', INTERVIEW: 'Interview',
  FINAL_INTERVIEW: 'Final Interview', OFFER: 'Offer', HIRED: 'Hired',
  REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn',
}
function daysInStage(candidate: Candidate) {
  return Math.max(0, Math.floor((Date.now() - new Date(candidate.lastStageUpdatedAt || candidate.appliedAt).getTime()) / 86_400_000))
}

function CandidateAvatar({ candidate }: { candidate: Candidate }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-700 ring-2 ring-white">
      {candidate.firstName.charAt(0)}{candidate.lastName.charAt(0)}
    </div>
  )
}

function useCandidates() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/recruitment/applications')
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not load candidates')
      setCandidates(data.applications ?? [])
      setPipelineStages(data.pipelineStages ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load candidates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const updateStage = useCallback(async (candidate: Candidate, pipelineStage: PipelineStage) => {
    if (pipelineStage.category === 'HIRED' && !candidate.hiredEmployeeId) {
      toast.info('Complete the employee details to finish hiring this candidate')
      window.location.assign(`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}&hire=1`)
      return
    }
    const previous = candidate
    setCandidates(current => current.map(item => item.id === candidate.id ? {
      ...item,
      stage: pipelineStage.category,
      pipelineStageId: pipelineStage.id,
      pipelineStage,
      lastStageUpdatedAt: new Date().toISOString(),
    } : item))
    try {
      const response = await fetch(`/api/recruitment/applications/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineStageId: pipelineStage.id }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not update candidate stage')
      toast.success(`Moved to ${pipelineStage.name}`)
    } catch (error) {
      setCandidates(current => current.map(item => item.id === candidate.id ? previous : item))
      toast.error(error instanceof Error ? error.message : 'Could not update candidate stage')
    }
  }, [])

  return { candidates, pipelineStages, loading, updateStage, reload: load }
}

export function CandidatesTab() {
  const searchParams = useSearchParams()
  const { candidates, pipelineStages, loading, updateStage, reload } = useCandidates()
  const [search, setSearch] = useState('')
  const [stageId, setStageId] = useState('ALL')
  const [jobId, setJobId] = useState('ALL')
  const [view, setView] = useState<'LIST' | 'KANBAN'>('LIST')
  const [managingPipeline, setManagingPipeline] = useState(() => searchParams.get('managePipeline') === '1')

  const jobs = useMemo(() => Array.from(new Map(candidates.map(candidate => [candidate.jobPost.id, candidate.jobPost])).values()), [candidates])
  const visible = useMemo(() => candidates.filter(candidate => {
    const query = search.trim().toLowerCase()
    if (stageId !== 'ALL' && candidate.pipelineStageId !== stageId) return false
    if (jobId !== 'ALL' && candidate.jobPost.id !== jobId) return false
    return !query || `${candidate.firstName} ${candidate.lastName} ${candidate.email} ${candidate.phone ?? ''} ${candidate.jobPost.title}`.toLowerCase().includes(query)
  }), [candidates, jobId, search, stageId])

  if (loading) return <div className="flex justify-center py-20"><AppSpinner /></div>

  return (
    <div className="space-y-5">
      <PageHeading
        title="Candidates"
        description="Review and move every applicant across all open roles from one place."
        count={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
      />
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, email, phone, or job..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand-primary)]" />
        </div>
        <FilterSelect value={jobId} onChange={setJobId} label="Job">
          <option value="ALL">All jobs</option>
          {jobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}
        </FilterSelect>
        <FilterSelect value={stageId} onChange={setStageId} label="Stage">
          <option value="ALL">All stages</option>
          {pipelineStages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </FilterSelect>
        <div className="flex rounded-xl bg-slate-100 p-1" aria-label="Candidate view">
          {([
            { id: 'LIST', label: 'List', icon: List },
            { id: 'KANBAN', label: 'Kanban', icon: LayoutGrid },
          ] as const).map(item => (
            <button key={item.id} type="button" onClick={() => setView(item.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${view === item.id ? 'bg-white text-[var(--brand-primary)] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <item.icon className="h-3.5 w-3.5" /> {item.label}
            </button>
          ))}
        </div>
      </div>
      {view === 'LIST'
        ? <CandidateTable candidates={visible} pipelineStages={pipelineStages} onStageChange={updateStage} />
        : <CandidateKanban candidates={visible} pipelineStages={pipelineStages} onStageChange={updateStage} />}
      {managingPipeline && <PipelineManager stages={pipelineStages} onClose={() => setManagingPipeline(false)} onChanged={reload} />}
    </div>
  )
}

function CandidateKanban({ candidates, pipelineStages, onStageChange }: { candidates: Candidate[]; pipelineStages: PipelineStage[]; onStageChange: (candidate: Candidate, stage: PipelineStage) => Promise<void> }) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)

  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex min-w-max items-start gap-3">
        {pipelineStages.map(stage => {
          const rows = candidates.filter(candidate => candidate.pipelineStageId === stage.id)
          return (
            <section
              key={stage.id}
              onDragOver={event => { event.preventDefault(); setOverStage(stage.id) }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOverStage(current => current === stage.id ? null : current) }}
              onDrop={event => {
                event.preventDefault()
                const candidate = candidates.find(item => item.id === draggingId)
                setDraggingId(null)
                setOverStage(null)
                if (candidate && candidate.pipelineStageId !== stage.id) void onStageChange(candidate, stage)
              }}
              className={`w-[285px] rounded-2xl border p-3 transition-colors ${overStage === stage.id ? 'border-[var(--brand-primary)] bg-blue-50/60' : 'border-slate-200 bg-slate-50/70'}`}
            >
              <header className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />
                  <h3 className="text-xs font-black text-slate-700">{stage.name}</h3>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500 ring-1 ring-slate-200">{rows.length}</span>
              </header>
              <div className="space-y-2 min-h-24">
                {rows.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-[11px] font-semibold text-slate-400">Drop candidate here</div>}
                {rows.map(candidate => (
                  <article
                    key={candidate.id}
                    draggable
                    onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; setDraggingId(candidate.id) }}
                    onDragEnd={() => { setDraggingId(null); setOverStage(null) }}
                    className={`cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition active:cursor-grabbing ${draggingId === candidate.id ? 'opacity-50' : 'hover:border-blue-200 hover:shadow-md'}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <CandidateAvatar candidate={candidate} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{candidate.firstName} {candidate.lastName}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">{candidate.jobPost.title}</p>
                      </div>
                      <Link href={`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}`} onClick={event => event.stopPropagation()} className="rounded-lg p-1 text-slate-400 hover:bg-blue-50 hover:text-[var(--brand-primary)]" aria-label={`Open ${candidate.firstName} ${candidate.lastName}`}><ChevronRight className="h-4 w-4" /></Link>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] font-semibold">
                      <span className="truncate text-slate-400">{candidate.jobPost.department || 'No department'}</span>
                      <span className={daysInStage(candidate) >= 7 && !TERMINAL_STAGES.includes(candidate.stage) ? 'text-amber-600' : 'text-slate-500'}>{daysInStage(candidate)}d in stage</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function InterviewsTab() {
  const { candidates, pipelineStages, loading, updateStage } = useCandidates()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1) })
  const interviewCandidates = useMemo(() => candidates
    .filter(candidate => candidate.stage === 'INTERVIEW' || candidate.stage === 'FINAL_INTERVIEW')
    .filter(candidate => !search.trim() || `${candidate.firstName} ${candidate.lastName} ${candidate.jobPost.title}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => daysInStage(b) - daysInStage(a)), [candidates, search])

  if (loading) return <div className="flex justify-center py-20"><AppSpinner /></div>

  return (
    <div className="space-y-5">
      <PageHeading title="Interviews" description="A focused queue for interviews and final interviews that need coordination." count={`${interviewCandidates.length} in queue`} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search interview queue..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2563eb]" />
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          <button type="button" onClick={() => setView('list')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${view === 'list' ? 'bg-[#2563eb] text-white' : 'text-slate-500 hover:bg-[#eff6ff] hover:text-[#1d4ed8]'}`}><List className="h-3.5 w-3.5" />List</button>
          <button type="button" onClick={() => { setView('calendar'); const first = interviewCandidates[0]; if (first) { const date = new Date(first.lastStageUpdatedAt); setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1)) } }} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${view === 'calendar' ? 'bg-[#2563eb] text-white' : 'text-slate-500 hover:bg-[#eff6ff] hover:text-[#1d4ed8]'}`}><CalendarDays className="h-3.5 w-3.5" />Calendar</button>
        </div>
      </div>
      {interviewCandidates.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No interviews in the queue" description="Candidates moved to Interview or Final Interview will appear here." />
      ) : view === 'calendar' ? (
        <InterviewCalendar candidates={interviewCandidates} month={calendarMonth} onMonthChange={setCalendarMonth} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {interviewCandidates.map(candidate => (
            <article key={candidate.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <CandidateAvatar candidate={candidate} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-900">{candidate.firstName} {candidate.lastName}</h3>
                    <span className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: `${candidate.pipelineStage?.color ?? '#f59e0b'}18`, color: candidate.pipelineStage?.color ?? '#b45309' }}>{candidate.pipelineStage?.name ?? STAGE_LABELS[candidate.stage]}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{candidate.jobPost.title}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1"><Clock3 className="h-3 w-3" /> {daysInStage(candidate)}d in stage</span>
                    <a href={`mailto:${candidate.email}`} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 font-semibold text-[var(--brand-primary)]"><Mail className="h-3 w-3" /> Email candidate</a>
                  </div>
                </div>
                <Link href={`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}`} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-blue-50 hover:text-[var(--brand-primary)]" aria-label={`Open ${candidate.firstName} ${candidate.lastName}`}><ChevronRight className="h-4 w-4" /></Link>
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold text-slate-500">Move to</span>
                <select value={candidate.pipelineStageId ?? ''} onChange={event => { const next = pipelineStages.find(item => item.id === event.target.value); if (next) void updateStage(candidate, next) }} className="ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700">
                  {pipelineStages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function InterviewCalendar({ candidates, month, onMonthChange }: { candidates: Candidate[]; month: Date; onMonthChange: (month: Date) => void }) {
  const year = month.getFullYear(), monthIndex = month.getMonth()
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const today = new Date()
  const byDate = new Map<string, Candidate[]>()
  candidates.forEach(candidate => {
    const date = new Date(candidate.lastStageUpdatedAt)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    byDate.set(key, [...(byDate.get(key) ?? []), candidate])
  })

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
      <div><h3 className="font-black text-slate-900">{month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</h3><p className="mt-0.5 text-[11px] text-slate-400">Candidates appear on the date they entered their interview stage.</p></div>
      <div className="flex items-center gap-1"><button type="button" onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-[#eff6ff] hover:text-[#2563eb]" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-[#eff6ff] hover:text-[#2563eb]">Today</button><button type="button" onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-[#eff6ff] hover:text-[#2563eb]" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button></div>
    </header>
    <div className="overflow-x-auto"><div className="grid min-w-[760px] grid-cols-7 border-b border-slate-200 bg-slate-50">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400">{day}</div>)}</div>
    <div className="grid min-w-[760px] grid-cols-7">{Array.from({ length: totalCells }, (_, cell) => {
      const day = cell - firstWeekday + 1
      const valid = day > 0 && day <= daysInMonth
      const entries = valid ? byDate.get(`${year}-${monthIndex}-${day}`) ?? [] : []
      const current = valid && day === today.getDate() && monthIndex === today.getMonth() && year === today.getFullYear()
      return <div key={cell} className="min-h-36 border-b border-r border-slate-100 p-2 last:border-r-0">
        {valid && <><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${current ? 'bg-[#2563eb] text-white' : 'text-slate-600'}`}>{day}</span><div className="mt-1.5 space-y-1.5">{entries.slice(0, 3).map(candidate => <Link key={candidate.id} href={`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}`} className="block rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-2 py-1.5 transition hover:bg-[#dbeafe]"><p className="truncate text-[11px] font-black text-[#1d4ed8]">{candidate.firstName} {candidate.lastName}</p><p className="truncate text-[9px] text-[#526d8a]">{candidate.jobPost.title}</p></Link>)}{entries.length > 3 && <p className="px-1 text-[10px] font-bold text-[#2563eb]">+{entries.length - 3} more</p>}</div></>}
      </div>
    })}</div></div>
  </section>
}

function CandidateTable({ candidates, pipelineStages, onStageChange }: { candidates: Candidate[]; pipelineStages: PipelineStage[]; onStageChange: (candidate: Candidate, stage: PipelineStage) => Promise<void> }) {
  if (candidates.length === 0) return <EmptyState icon={UsersRound} title="No candidates found" description="Try changing the search or filters." />
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Job</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Time in stage</th><th className="w-12" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {candidates.map(candidate => (
              <tr key={candidate.id} className="hover:bg-blue-50/40">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><CandidateAvatar candidate={candidate} /><div><p className="font-bold text-slate-900">{candidate.firstName} {candidate.lastName}</p><p className="text-xs text-slate-400">{candidate.email}</p></div></div></td>
                <td className="px-4 py-3 text-slate-600">{candidate.phone || '—'}</td>
                <td className="px-4 py-3"><p className="font-semibold text-slate-800">{candidate.jobPost.title}</p><p className="text-xs text-slate-400">{candidate.jobPost.department || 'No department'}</p></td>
                <td className="px-4 py-3"><select value={candidate.pipelineStageId ?? ''} onChange={event => { const next = pipelineStages.find(item => item.id === event.target.value); if (next) void onStageChange(candidate, next) }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700">{pipelineStages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></td>
                <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-xs font-semibold ${daysInStage(candidate) >= 7 && !['HIRED','REJECTED','WITHDRAWN'].includes(candidate.stage) ? 'text-amber-600' : 'text-slate-500'}`}><Clock3 className="h-3.5 w-3.5" />{daysInStage(candidate)} days</span></td>
                <td className="px-3"><Link href={`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}`} className="inline-flex rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-[var(--brand-primary)]" aria-label={`Open ${candidate.firstName} ${candidate.lastName}`}><ChevronRight className="h-4 w-4" /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PipelineManager({ stages, onClose, onChanged }: { stages: PipelineStage[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#0b6ffb')
  const [category, setCategory] = useState<Stage>('SCREENING')
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function createStage() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const response = await fetch('/api/recruitment/pipeline-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color, category }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not add stage')
      setName('')
      await onChanged()
      toast.success('Pipeline stage added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add stage')
    } finally {
      setSaving(false)
    }
  }

  async function deleteStage(id: string) {
    setSaving(true)
    try {
      const response = await fetch(`/api/recruitment/pipeline-stages?id=${id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not delete stage')
      setConfirmDeleteId(null)
      await onChanged()
      toast.success('Pipeline stage removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete stage')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-5">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-slate-950/45" aria-label="Close pipeline settings" />
      <section role="dialog" aria-modal="true" aria-label="Manage recruitment pipeline" className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div><h2 className="text-lg font-black text-slate-900">Manage pipeline</h2><p className="mt-0.5 text-xs text-slate-500">Create company-specific stages and map each one to its automation category.</p></div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-2 overflow-y-auto p-5">
          {stages.map(stage => <PipelineStageEditor key={stage.id} stage={stage} disabled={saving} confirmingDelete={confirmDeleteId === stage.id} onRequestDelete={() => setConfirmDeleteId(stage.id)} onCancelDelete={() => setConfirmDeleteId(null)} onDelete={() => void deleteStage(stage.id)} onChanged={onChanged} />)}
        </div>
        <div className="border-t border-slate-100 bg-slate-50 p-5">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Add stage</p>
          <div className="grid gap-2 sm:grid-cols-[44px_minmax(0,1fr)_180px_auto]">
            <input type="color" value={color} onChange={event => setColor(event.target.value)} className="h-10 w-11 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" aria-label="Stage color" />
            <input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Technical Assessment" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]" />
            <select value={category} onChange={event => setCategory(event.target.value as Stage)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{STAGES.map(item => <option key={item} value={item}>{STAGE_LABELS[item]}</option>)}</select>
            <button type="button" onClick={() => void createStage()} disabled={saving || !name.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><Plus className="h-4 w-4" /> Add</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function PipelineStageEditor({ stage, disabled, confirmingDelete, onRequestDelete, onCancelDelete, onDelete, onChanged }: { stage: PipelineStage; disabled: boolean; confirmingDelete: boolean; onRequestDelete: () => void; onCancelDelete: () => void; onDelete: () => void; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(stage.name)
  const [color, setColor] = useState(stage.color)
  const [category, setCategory] = useState<Stage>(stage.category)
  const [saving, setSaving] = useState(false)
  const dirty = name.trim() !== stage.name || color !== stage.color || category !== stage.category

  async function save() {
    if (!dirty || !name.trim()) return
    setSaving(true)
    try {
      const response = await fetch('/api/recruitment/pipeline-stages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: stage.id, name: name.trim(), color, category }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not update stage')
      await onChanged()
      toast.success('Pipeline stage updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update stage')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid items-center gap-2 sm:grid-cols-[40px_minmax(0,1fr)_170px_auto]">
        <input type="color" value={color} onChange={event => setColor(event.target.value)} className="h-9 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" aria-label={`${stage.name} color`} />
        <input value={name} onChange={event => setName(event.target.value)} className="min-w-0 rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold outline-none focus:border-[var(--brand-primary)]" />
        <select value={category} onChange={event => setCategory(event.target.value as Stage)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600">{STAGES.map(item => <option key={item} value={item}>{STAGE_LABELS[item]}</option>)}</select>
        <div className="flex justify-end gap-1">
          {dirty && <button type="button" disabled={disabled || saving} onClick={() => void save()} className="rounded-lg p-2 text-[var(--brand-primary)] hover:bg-blue-50" aria-label={`Save ${stage.name}`}><Save className="h-4 w-4" /></button>}
          <button type="button" disabled={disabled} onClick={onRequestDelete} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${stage.name}`}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {confirmingDelete && <div className="mt-2 flex items-center justify-end gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs"><span className="mr-auto font-semibold text-red-700">Candidates in this stage will be moved automatically.</span><button type="button" onClick={onCancelDelete} className="font-bold text-slate-600">Cancel</button><button type="button" onClick={onDelete} className="rounded-lg bg-red-600 px-2.5 py-1.5 font-bold text-white">Delete</button></div>}
    </div>
  )
}

function PageHeading({ title, description, count }: { title: string; description: string; count: string }) {
  return <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-black text-slate-900">{title}</h1><p className="mt-0.5 text-sm text-slate-500">{description}</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-[var(--brand-primary)]">{count}</span></header>
}

function FilterSelect({ value, onChange, label, children }: { value: string; onChange: (value: string) => void; label: string; children: React.ReactNode }) {
  return <label className="relative min-w-44"><SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><span className="sr-only">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm text-slate-700 outline-none focus:border-[var(--brand-primary)]">{children}</select></label>
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[var(--brand-primary)]"><Icon className="h-6 w-6" /></div><h3 className="mt-3 font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div>
}
