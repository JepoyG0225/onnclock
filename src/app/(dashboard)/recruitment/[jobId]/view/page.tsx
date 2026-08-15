'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Briefcase, Building2, Calendar, CheckCircle2, Copy, ExternalLink,
  Eye, EyeOff, MapPin, Sparkles, Users, Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Read-only "what does this job posting look like" view for admins.
 *
 * Separate from /recruitment/[jobId]/page.tsx (which is the applicant
 * tracking dashboard) — this page focuses on the JOB itself: title,
 * description, requirements, benefits, salary, public URL. Useful for
 * HR to review what candidates see, copy the public apply link, or
 * preview a draft before publishing.
 */

type Visibility = 'DRAFT' | 'PUBLIC' | 'CLOSED' | 'ARCHIVED'

type JobPost = {
  id: string
  title: string
  description: string
  department: string | null
  employmentType: string | null
  workSetup: string | null
  location: string | null
  requirements: string[]
  benefits: string[]
  salaryMin: number | null
  salaryMax: number | null
  visibility: Visibility
  publicApplyToken: string
  publishedAt: string | null
  closesAt: string | null
  createdAt: string
  _count?: { applications: number }
}

const VISIBILITY_TONE: Record<Visibility, { variant: 'success' | 'pending' | 'warning' | 'destructive'; label: string }> = {
  DRAFT:    { variant: 'pending',     label: 'Draft' },
  PUBLIC:   { variant: 'success',     label: 'Live' },
  CLOSED:   { variant: 'warning',     label: 'Closed' },
  ARCHIVED: { variant: 'destructive', label: 'Archived' },
}

function fmtSalary(min: number | null, max: number | null) {
  if (min == null && max == null) return '—'
  const peso = (n: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n)
  if (min != null && max != null) return `${peso(min)} – ${peso(max)} / month`
  if (min != null) return `From ${peso(min)} / month`
  return `Up to ${peso(max!)} / month`
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

export default function JobPostViewPage() {
  const params = useParams<{ jobId: string }>()
  const jobId = params.jobId
  const [job, setJob] = useState<JobPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/recruitment/jobs/${jobId}`)
      .then(async r => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}))
          throw new Error(data?.error || `Failed to load job (HTTP ${r.status})`)
        }
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        const j = data.job
        setJob({
          ...j,
          requirements: Array.isArray(j.requirements) ? j.requirements : [],
          benefits: Array.isArray(j.benefits) ? j.benefits : [],
          salaryMin: j.salaryMin != null ? Number(j.salaryMin) : null,
          salaryMax: j.salaryMax != null ? Number(j.salaryMax) : null,
        })
      })
      .catch(err => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [jobId])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <AppSpinner size="md" />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="space-y-4">
        <Link href="/recruitment" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Recruitment
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-sm text-rose-600">
            {error || 'Job post not found'}
          </CardContent>
        </Card>
      </div>
    )
  }

  const tone = VISIBILITY_TONE[job.visibility]
  const publicUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/apply/${job.publicApplyToken}`
      : `/apply/${job.publicApplyToken}`

  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      toast.success('Public apply link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/recruitment" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Recruitment
      </Link>

      <PageHeader
        eyebrow="Job Posting"
        icon={<Briefcase className="h-5 w-5" />}
        title={job.title}
        subtitle={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <Badge variant={tone.variant}>{tone.label}</Badge>
            {job.department && <span>· {job.department}</span>}
            {job.employmentType && <span>· {job.employmentType.replace(/_/g, ' ')}</span>}
            {job.workSetup && <span>· {job.workSetup}</span>}
          </div>
        }
        actions={
          <>
            <Link href={`/recruitment/${jobId}`}>
              <Button variant="outline" size="sm">
                <Users className="mr-2 h-4 w-4" />
                {job._count?.applications ?? 0} applicants
              </Button>
            </Link>
            {job.visibility === 'PUBLIC' && (
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Public page
                </Button>
              </a>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Main column ────────────────────────────────────────── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              {job.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {job.description}
                </p>
              ) : (
                <p className="text-sm italic text-slate-400">No description added.</p>
              )}
            </CardContent>
          </Card>

          {job.requirements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Requirements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {job.requirements.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span className="whitespace-pre-wrap">{r}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {job.benefits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Benefits & Perks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {job.benefits.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span className="whitespace-pre-wrap">{b}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Side rail — metadata + public link ─────────────────── */}
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <MetaRow icon={<Wallet className="h-4 w-4" />} label="Salary" value={fmtSalary(job.salaryMin, job.salaryMax)} />
              {job.location && (
                <MetaRow icon={<MapPin className="h-4 w-4" />} label="Location" value={job.location} />
              )}
              {job.department && (
                <MetaRow icon={<Building2 className="h-4 w-4" />} label="Department" value={job.department} />
              )}
              <MetaRow
                icon={<Calendar className="h-4 w-4" />}
                label="Published"
                value={fmtDate(job.publishedAt)}
              />
              {job.closesAt && (
                <MetaRow icon={<Calendar className="h-4 w-4" />} label="Closes" value={fmtDate(job.closesAt)} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Public Application Link
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="break-all font-mono text-xs text-slate-700">{publicUrl}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyPublicLink} className="flex-1">
                  {copied ? <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button size="sm" variant="outline" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open
                  </Button>
                </a>
              </div>
              {job.visibility !== 'PUBLIC' && (
                <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
                  <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This link will only accept applications once the post is set to <strong>Public</strong>.
                </p>
              )}
              {job.visibility === 'PUBLIC' && (
                <p className="flex items-start gap-1.5 rounded-md bg-emerald-50 px-2.5 py-2 text-xs text-emerald-700">
                  <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This posting is live and accepting applications.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-900">{value}</p>
      </div>
    </div>
  )
}
