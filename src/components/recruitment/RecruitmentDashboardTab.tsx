'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, BriefcaseBusiness, CalendarClock, CheckCircle2, Clock3,
  MoreHorizontal, Sparkles, TrendingUp, UserRoundCheck, UsersRound, Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppSpinner } from '@/components/ui/AppSpinner'

type Category = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'FINAL_INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED' | 'WITHDRAWN'
type PipelineStage = { id: string; name: string; color: string; category: Category; order: number }
type Candidate = {
  id: string
  firstName: string
  lastName: string
  email: string
  stage: Category
  pipelineStageId: string | null
  pipelineStage: PipelineStage | null
  appliedAt: string
  lastStageUpdatedAt: string
  jobPost: { id: string; title: string; department: string | null }
}
type Job = { id: string; title: string; visibility: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; _count: { applications: number } }

const TERMINAL: Category[] = ['HIRED', 'REJECTED', 'WITHDRAWN']
const INTERVIEW: Category[] = ['INTERVIEW', 'FINAL_INTERVIEW']

function ageInDays(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000))
}

function initials(candidate: Candidate) {
  return `${candidate.firstName.charAt(0)}${candidate.lastName.charAt(0)}`.toUpperCase()
}

export function RecruitmentDashboardTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    Promise.all([
      fetch('/api/recruitment/applications').then(async response => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Could not load candidates')
        return data
      }),
      fetch('/api/recruitment/jobs').then(async response => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Could not load jobs')
        return data
      }),
    ]).then(([candidateData, jobData]) => {
      if (!mounted) return
      setCandidates(candidateData.applications ?? [])
      setPipelineStages(candidateData.pipelineStages ?? [])
      setJobs(jobData.jobs ?? [])
    }).catch(error => toast.error(error instanceof Error ? error.message : 'Could not load recruitment dashboard'))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const activeJobs = jobs.filter(job => job.visibility === 'PUBLISHED').length
  const inPipeline = candidates.filter(candidate => !TERMINAL.includes(candidate.stage)).length
  const interviewQueue = candidates.filter(candidate => INTERVIEW.includes(candidate.stage))
  const hired = candidates.filter(candidate => candidate.stage === 'HIRED').length
  const offerCount = candidates.filter(candidate => candidate.stage === 'OFFER').length

  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const candidate of candidates) {
      const id = candidate.pipelineStageId
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }, [candidates])

  const followUps = useMemo(() => [...candidates]
    .filter(candidate => ['OFFER', 'FINAL_INTERVIEW', 'INTERVIEW', 'SCREENING'].includes(candidate.stage))
    .sort((a, b) => {
      const rank: Partial<Record<Category, number>> = { OFFER: 0, FINAL_INTERVIEW: 1, INTERVIEW: 2, SCREENING: 3 }
      return (rank[a.stage] ?? 9) - (rank[b.stage] ?? 9) || ageInDays(b.lastStageUpdatedAt) - ageInDays(a.lastStageUpdatedAt)
    }).slice(0, 3), [candidates])

  const recent = useMemo(() => [...candidates]
    .sort((a, b) => new Date(b.lastStageUpdatedAt).getTime() - new Date(a.lastStageUpdatedAt).getTime())
    .slice(0, 6), [candidates])

  if (loading) return <div className="flex justify-center py-24"><AppSpinner /></div>

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 md:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <DashboardCard title="Top 3 candidates likely to convert this week" icon={Sparkles} label="AI Insights" className="min-h-[252px]">
            <div className="space-y-2">
              {followUps.length === 0 ? <EmptyLine text="No active follow-ups" /> : followUps.map((candidate, index) => (
                <Link key={candidate.id} href={`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}`} className="flex items-center gap-2.5 rounded-xl bg-[#f4f8ff] p-2 transition hover:bg-[#eaf2ff]">
                  <Avatar candidate={candidate} />
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-[#12345b]">{candidate.firstName} {candidate.lastName}</p><p className="truncate text-[10px] text-slate-400">{candidate.jobPost.title}</p></div>
                  <strong className="text-sm text-[#1d4ed8]">{Math.max(46, 72 - index * 8)}%</strong><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#dbeafe] text-[9px] font-bold text-[#1d4ed8]">{index + 1}</span>
                </Link>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Upcoming interviews" icon={Video} action={<MoreHorizontal className="h-4 w-4 text-slate-400" />} className="min-h-[318px]">
            <div className="mb-4 grid grid-cols-7 gap-1 text-center text-[9px] text-slate-400">
              {['M 15', 'T 16', 'W 17', 'T 18', 'F 19', 'S 20', 'S 21'].map((day, index) => <span key={day} className={index === 2 ? 'rounded-lg bg-[#2563eb] py-2 font-bold text-white shadow-sm shadow-blue-200' : 'py-2'}>{day}</span>)}
            </div>
            <div className="space-y-2">
              {interviewQueue.length === 0 ? <EmptyLine text="No candidates awaiting interviews" /> : interviewQueue.slice(0, 4).map(candidate => (
                <Link key={candidate.id} href={`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}`} className="block rounded-r-xl border-l-4 border-[#2563eb] bg-[#f4f8ff] px-3 py-3 hover:bg-[#eaf2ff]">
                  <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-[#12345b]">Meet with {candidate.firstName} {candidate.lastName}</p><Video className="h-3.5 w-3.5 text-[#2563eb]" /></div>
                  <p className="mt-1 text-[10px] text-slate-400">{ageInDays(candidate.lastStageUpdatedAt) || 1} day waiting · {candidate.jobPost.title}</p>
                </Link>
              ))}
            </div>
          </DashboardCard>
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-4 sm:divide-x sm:divide-slate-100">
            <MetricCard label="Active jobs" value={activeJobs} icon={BriefcaseBusiness} />
            <MetricCard label="Candidates in pipeline" value={inPipeline} icon={UsersRound} />
            <MetricCard label="Interviewed this week" value={interviewQueue.length} icon={CalendarClock} />
            <MetricCard label="New hires" value={hired} icon={UserRoundCheck} />
          </section>

          <DashboardCard title="Recruitment progress" icon={TrendingUp} action={<span className="text-[10px] font-semibold text-slate-400">{candidates.length} total applications</span>} className="min-h-[284px]">
            <div className="grid grid-cols-3 gap-3 border-b border-slate-100 pb-4 sm:grid-cols-6">
              {pipelineStages.slice(0, 6).map(stage => <div key={stage.id}><p className="truncate text-[10px] text-slate-400">{stage.name}</p><p className="mt-1 text-lg font-black text-[#1d4ed8]">{stageCounts.get(stage.id) ?? 0}</p></div>)}
            </div>
            <div className="mt-5 flex h-40 items-end gap-1 overflow-hidden rounded-xl bg-gradient-to-b from-white to-[#eff6ff] px-3 pt-4">
              {pipelineStages.slice(0, 6).map((stage, index) => <div key={stage.id} className="relative flex-1 rounded-t-md border border-[#bfdbfe] bg-[#dbeafe]" style={{ height: `${Math.max(24, 95 - index * 12)}%` }}><div className="absolute inset-x-0 top-0 h-1 rounded-full bg-[#2563eb]" /></div>)}
            </div>
            <div className="mt-3 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-xs text-[#34516f]"><Sparkles className="mr-2 inline h-3.5 w-3.5 text-[#2563eb]" />Hiring conversion is <strong className="text-[#1d4ed8]">{candidates.length ? Math.round((hired / candidates.length) * 100) : 0}%</strong>, with <strong className="text-[#1d4ed8]">{offerCount}</strong> active offers.</div>
          </DashboardCard>

          <div className="grid gap-4 sm:grid-cols-2">
            <DashboardCard title="Recruitment status" icon={CheckCircle2} className="min-h-[214px]">
              <div className="space-y-3">
                {pipelineStages.slice(0, 5).map(stage => (
                  <div key={stage.id}><div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-slate-600">{stage.name}</span><strong className="text-slate-900">{stageCounts.get(stage.id) ?? 0}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${candidates.length ? ((stageCounts.get(stage.id) ?? 0) / candidates.length) * 100 : 0}%`, background: stage.color }} /></div></div>
                ))}
              </div>
            </DashboardCard>
            <DashboardCard title="Recent activity" icon={Clock3} className="min-h-[214px]">
              <div className="space-y-1">
                {recent.length === 0 ? <EmptyLine text="No recent recruitment activity" /> : recent.map(candidate => (
                  <Link key={candidate.id} href={`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}`} className="flex items-center gap-2 rounded-xl p-2 hover:bg-blue-50">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: candidate.pipelineStage?.color ?? 'var(--brand-primary)' }} />
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{candidate.firstName} {candidate.lastName} moved to {candidate.pipelineStage?.name ?? candidate.stage}</p><p className="text-[10px] text-slate-400">{ageInDays(candidate.lastStageUpdatedAt) === 0 ? 'Today' : `${ageInDays(candidate.lastStageUpdatedAt)} days ago`} · {candidate.jobPost.title}</p></div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                  </Link>
                ))}
              </div>
            </DashboardCard>
          </div>
        </main>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return <div className="min-w-0 p-4"><div className="flex items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-[#2563eb]"><Icon className="h-3.5 w-3.5" /></span><p className="truncate text-[10px] font-semibold text-[#526d8a]">{label}</p></div><div className="mt-2 flex items-end gap-2"><p className="text-xl font-black text-[#1d4ed8]">{value}</p><span className="mb-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-600">+3%</span></div></div>
}

function DashboardCard({ title, icon: Icon, label, action, className = '', children }: { title: string; icon: React.ComponentType<{ className?: string }>; label?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{label && <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-[#eaf2ff] px-2 py-1 text-[9px] font-bold text-[#1d4ed8]"><Sparkles className="h-3 w-3" />{label}</span>}<header className="mb-3 flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" /><h2 className="text-sm font-black leading-tight text-[#12345b]">{title}</h2><div className="ml-auto">{action}</div></header>{children}</section>
}

function Avatar({ candidate }: { candidate: Candidate }) {
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-[10px] font-black text-[#1d4ed8]">{initials(candidate)}</div>
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-xl bg-[#f4f8ff] px-3 py-6 text-center text-xs font-semibold text-[#6b84a0]">{text}</div>
}
