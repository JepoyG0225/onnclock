'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, BriefcaseBusiness, CalendarClock, CheckCircle2, Clock3,
  MoreHorizontal, Sparkles, TrendingUp, UserRoundCheck, UsersRound, Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/ui/kpi-card'
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
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
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
    }).catch(error => { if (mounted) setError(error instanceof Error ? error.message : 'Could not load recruitment dashboard') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [refresh])

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

  if (error) return <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6"><p className="text-sm text-red-700">{error}</p><button onClick={()=>setRefresh(v=>v+1)} className="mt-3 rounded-lg bg-[#ff5900] px-4 py-2 text-sm text-white">Try again</button></div>
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#162d54]">Hiring overview</h2><p className="mt-1 text-sm text-slate-500">Track open roles, candidate progress and next steps.</p></div><Link href="/recruitment?tab=jobs" className="inline-flex items-center gap-2 rounded-xl bg-[#ff5900] px-4 py-2.5 text-sm font-medium text-white">Manage jobs<ArrowRight size={15}/></Link></div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Active jobs" value={activeJobs} icon={<BriefcaseBusiness/>}/>
        <KpiCard label="Candidates in pipeline" value={inPipeline} icon={<UsersRound/>}/>
        <KpiCard label="At interview stage" value={interviewQueue.length} icon={<CalendarClock/>}/>
        <KpiCard label="Hired candidates" value={hired} icon={<UserRoundCheck/>} tone="accent"/>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <div className="min-w-0 space-y-5">
          <DashboardCard title="Candidate pipeline" icon={TrendingUp} action={<Link href="/recruitment?tab=candidates" className="text-xs text-[#0054d7]">View candidates</Link>}>
            <p className="mb-5 text-xs text-slate-500">{candidates.length} total applications across all roles</p>
            <div className="space-y-4">{pipelineStages.map(stage=>{const count=stageCounts.get(stage.id)??0;return <div key={stage.id}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-medium text-[#162d54]">{stage.name}</span><span className="font-semibold tabular-nums text-[#162d54]">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{width:`${candidates.length ? count/candidates.length*100 : 0}%`,background:stage.color}}/></div></div>})}{!pipelineStages.length&&<EmptyLine text="No pipeline stages available"/>}</div>
            <div className="mt-5 flex flex-wrap gap-4 rounded-xl bg-orange-50/70 p-4 text-sm text-[#162d54]"><span><strong>{candidates.length ? Math.round(hired/candidates.length*100):0}%</strong> hired</span><span><strong>{offerCount}</strong> active offers</span></div>
          </DashboardCard>
          <DashboardCard title="Recent activity" icon={Clock3}>
            <div className="divide-y divide-slate-100">{recent.length===0 ? <EmptyLine text="No recent recruitment activity"/> : recent.map(candidate=><Link key={candidate.id} href={`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}`} className="flex items-center gap-3 rounded-lg py-3 hover:bg-slate-50"><Avatar candidate={candidate}/><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-[#162d54]">{candidate.firstName} {candidate.lastName}</p><p className="mt-1 text-xs text-slate-500">{candidate.pipelineStage?.name??candidate.stage} / {candidate.jobPost.title}</p></div><span className="shrink-0 text-xs text-slate-400">{ageInDays(candidate.lastStageUpdatedAt)===0?'Today':`${ageInDays(candidate.lastStageUpdatedAt)}d ago`}</span></Link>)}</div>
          </DashboardCard>
        </div>
        <div className="min-w-0 space-y-5">
          <DashboardCard title="Priority follow-ups" icon={UsersRound}>
            <p className="mb-3 text-xs leading-5 text-slate-500">Offers and later-stage candidates first, then time waiting in the stage.</p>
            <div className="space-y-2">{followUps.length===0 ? <EmptyLine text="No active follow-ups"/> : followUps.map(candidate=><Link key={candidate.id} href={`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}`} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 hover:border-orange-200"><Avatar candidate={candidate}/><div className="min-w-0"><p className="text-sm font-medium text-[#162d54]">{candidate.firstName} {candidate.lastName}</p><p className="mt-1 text-xs text-slate-500">{candidate.jobPost.title}</p><p className="mt-2 text-xs text-[#a93b00]">{candidate.pipelineStage?.name??candidate.stage} / {ageInDays(candidate.lastStageUpdatedAt)}d in stage</p></div></Link>)}</div>
          </DashboardCard>
          <DashboardCard title="Interview queue" icon={Video} action={<Link href="/recruitment?tab=interviews" className="text-xs text-[#0054d7]">View all</Link>}>
            <p className="mb-3 text-xs leading-5 text-slate-500">Candidates currently in interview stages.</p>
            <div className="space-y-2">{!interviewQueue.length ? <EmptyLine text="No candidates awaiting interviews"/> : interviewQueue.slice(0,4).map(candidate=><Link key={candidate.id} href={`/recruitment/${candidate.jobPost.id}?applicationId=${candidate.id}`} className="block rounded-xl border-l-2 border-[#ff5900] bg-slate-50 p-3"><p className="text-sm font-medium text-[#162d54]">{candidate.firstName} {candidate.lastName}</p><p className="mt-1 text-xs text-slate-500">{candidate.jobPost.title}</p></Link>)}</div>
          </DashboardCard>
        </div>
      </div>
    </div>
  )
}

function DashboardCard({ title, icon: Icon, label, action, className = '', children }: { title: string; icon: React.ComponentType<{ className?: string }>; label?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{label && <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-[#eaf2ff] px-2 py-1 text-[9px] font-bold text-[#0044ad]"><Sparkles className="h-3 w-3" />{label}</span>}<header className="mb-3 flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#0054d7]" /><h2 className="text-sm font-semibold leading-tight text-[#162d54]">{title}</h2><div className="ml-auto">{action}</div></header>{children}</section>
}

function Avatar({ candidate }: { candidate: Candidate }) {
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-[10px] font-semibold text-[#0044ad]">{initials(candidate)}</div>
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-xl bg-[#f4f8ff] px-3 py-6 text-center text-xs font-semibold text-[#6b84a0]">{text}</div>
}
