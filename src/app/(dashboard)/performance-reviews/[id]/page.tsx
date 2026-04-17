'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  ArrowLeft, Loader2, Star, CheckCircle2, Clock3, CircleDot,
  Save, ChevronRight, Plus, Trash2, Target, MessageSquare,
  BarChart3, User, Calendar, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPETENCIES = [
  { key: 'jobKnowledge',    label: 'Job Knowledge',          desc: 'Understanding of role responsibilities and technical skills' },
  { key: 'qualityOfWork',   label: 'Quality of Work',        desc: 'Accuracy, thoroughness, and attention to detail' },
  { key: 'productivity',    label: 'Productivity',           desc: 'Volume and efficiency of work output' },
  { key: 'communication',   label: 'Communication',          desc: 'Clarity, listening, and collaboration with others' },
  { key: 'teamwork',        label: 'Teamwork',               desc: 'Contribution to team goals and positive work relationships' },
  { key: 'initiative',      label: 'Initiative',             desc: 'Proactiveness, creativity, and going beyond what is required' },
  { key: 'reliability',     label: 'Reliability',            desc: 'Consistency, punctuality, and dependability' },
]

// Custom competency keys are prefixed with "custom:" so labels are self-contained in the scores JSON.
// e.g. { "custom:Leadership": 4, "custom:Attendance": 5 }
function isCustomKey(key: string) { return key.startsWith('custom:') }
function customLabel(key: string) { return key.slice('custom:'.length) }
function customKey(label: string) { return `custom:${label.trim()}` }

const RATING_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Needs Improvement',    color: 'text-red-600'    },
  2: { label: 'Below Expectations',   color: 'text-orange-500' },
  3: { label: 'Meets Expectations',   color: 'text-amber-500'  },
  4: { label: 'Exceeds Expectations', color: 'text-blue-600'   },
  5: { label: 'Outstanding',          color: 'text-emerald-600'},
}

type ReviewStatus = 'DRAFT' | 'IN_REVIEW' | 'COMPLETED' | 'ACKNOWLEDGED'

interface Goal {
  id: string
  title: string
  targetDate?: string | null
  status: 'pending' | 'achieved' | 'missed'
}

interface Review {
  id: string
  cycleLabel: string
  periodStart: string
  periodEnd: string
  status: ReviewStatus
  overallRating: number | null
  strengths: string | null
  improvementAreas: string | null
  managerComment: string | null
  employeeComment: string | null
  competencyScores: Record<string, number>
  goals: Goal[]
  completedAt: string | null
  acknowledgedAt: string | null
  employee: {
    id: string; firstName: string; lastName: string; employeeNo: string; photoUrl?: string | null
    department?: { name: string } | null
    position?: { title: string } | null
  }
  reviewer: { id: string; firstName: string; lastName: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<ReviewStatus, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  DRAFT:        { label: 'Draft',         color: 'text-slate-600',    bg: 'bg-slate-100',    icon: CircleDot    },
  IN_REVIEW:    { label: 'In Review',     color: 'text-amber-700',    bg: 'bg-amber-100',    icon: Clock3       },
  COMPLETED:    { label: 'Completed',     color: 'text-blue-700',     bg: 'bg-blue-100',     icon: CheckCircle2 },
  ACKNOWLEDGED: { label: 'Acknowledged', color: 'text-emerald-700',  bg: 'bg-emerald-100',  icon: CheckCircle2 },
}

function averageScore(scores: Record<string, number>): number | null {
  // Include both built-in and custom competencies
  const vals = Object.values(scores).filter(v => typeof v === 'number' && v > 0)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

// ─── Star Rating Input ────────────────────────────────────────────────────────

function StarRatingInput({
  value, onChange, disabled,
}: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map(i => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onMouseEnter={() => !disabled && setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => !disabled && onChange(i)}
          className="disabled:cursor-default"
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              i <= (hover || value)
                ? 'fill-amber-400 text-amber-400'
                : 'text-slate-200 fill-slate-100'
            }`}
          />
        </button>
      ))}
      {value > 0 && (
        <span className={`text-xs font-semibold ml-1 ${RATING_LABELS[value]?.color ?? ''}`}>
          {RATING_LABELS[value]?.label}
        </span>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [review,      setReview]      = useState<Review | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [activeTab,   setActiveTab]   = useState<'overview' | 'scorecard' | 'goals' | 'comments'>('overview')

  // Edit state
  const [scores,           setScores]           = useState<Record<string, number>>({})
  const [strengths,        setStrengths]        = useState('')
  const [improvementAreas, setImprovementAreas] = useState('')
  const [managerComment,   setManagerComment]   = useState('')
  const [employeeComment,  setEmployeeComment]  = useState('')
  const [goals,            setGoals]            = useState<Goal[]>([])
  const [newGoalTitle,        setNewGoalTitle]        = useState('')
  const [newGoalDate,         setNewGoalDate]         = useState('')
  const [newCompetencyLabel,  setNewCompetencyLabel]  = useState('')
  const [isManager,           setIsManager]           = useState(false)
  const [isEmployee,          setIsEmployee]          = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reviewRes, meRes] = await Promise.all([
        fetch(`/api/performance-reviews/${id}`),
        fetch('/api/employees/me').catch(() => ({ ok: false, json: async () => ({}) })),
      ])
      if (!reviewRes.ok) {
        const d = await reviewRes.json()
        toast.error(d.error ?? 'Failed to load review')
        return
      }
      const { review: r } = await reviewRes.json()
      setReview(r)
      setScores(r.competencyScores ?? {})
      setStrengths(r.strengths ?? '')
      setImprovementAreas(r.improvementAreas ?? '')
      setManagerComment(r.managerComment ?? '')
      setEmployeeComment(r.employeeComment ?? '')
      setGoals(Array.isArray(r.goals) ? r.goals : [])

      // Determine current user's role relative to this review
      if ((meRes as Response).ok) {
        const me = await (meRes as Response).json()
        const empId = me.employee?.id ?? me.id
        setIsManager(empId === r.reviewerId)
        setIsEmployee(empId === r.employeeId)
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function save(extra: Record<string, unknown> = {}) {
    if (!review) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        competencyScores: scores,
        strengths,
        improvementAreas,
        managerComment,
        goals,
        ...extra,
      }
      // Auto-calc overall rating from scores
      const avg = averageScore(scores)
      if (avg !== null) body.overallRating = parseFloat(avg.toFixed(2))

      const res  = await fetch(`/api/performance-reviews/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Review saved')
        setReview(data.review)
      } else {
        toast.error(data.error ?? 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveEmployeeComment() {
    if (!review) return
    setSaving(true)
    try {
      const res  = await fetch(`/api/performance-reviews/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ employeeComment }),
      })
      const data = await res.json()
      if (res.ok) { toast.success('Self-evaluation saved'); setReview(data.review) }
      else toast.error(data.error ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function transition(status: 'IN_REVIEW' | 'COMPLETED') {
    await save({ status })
    void load()
  }

  async function acknowledge() {
    setSaving(true)
    try {
      const res  = await fetch(`/api/performance-reviews/${id}/acknowledge`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) { toast.success('Review acknowledged'); void load() }
      else toast.error(data.error ?? 'Failed to acknowledge')
    } finally {
      setSaving(false)
    }
  }

  function addGoal() {
    if (!newGoalTitle.trim()) return
    setGoals(prev => [...prev, {
      id:         `goal_${Date.now()}`,
      title:      newGoalTitle.trim(),
      targetDate: newGoalDate || null,
      status:     'pending',
    }])
    setNewGoalTitle('')
    setNewGoalDate('')
  }

  function removeGoal(goalId: string) {
    setGoals(prev => prev.filter(g => g.id !== goalId))
  }

  function setGoalStatus(goalId: string, status: Goal['status']) {
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, status } : g))
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!review) return null

  const statusMeta  = STATUS_META[review.status]
  const StatusIcon  = statusMeta.icon
  const canEdit     = (isManager) && review.status !== 'ACKNOWLEDGED'
  const canEditHR   = !isEmployee && review.status !== 'ACKNOWLEDGED'
  const canSelfEval = isEmployee && ['IN_REVIEW', 'COMPLETED'].includes(review.status)
  const canAck      = isEmployee && review.status === 'COMPLETED'
  const avgScore    = averageScore(scores)

  const TABS = [
    { key: 'overview',  label: 'Overview',   icon: BarChart3      },
    { key: 'scorecard', label: 'Scorecard',  icon: Star           },
    { key: 'goals',     label: 'Goals',      icon: Target         },
    { key: 'comments',  label: 'Comments',   icon: MessageSquare  },
  ] as const

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <button onClick={() => router.push('/performance-reviews')} className="hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Performance Reviews
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-700 font-medium">{review.employee.firstName} {review.employee.lastName} — {review.cycleLabel}</span>
      </div>

      {/* Employee header card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4 flex-wrap">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-2xl bg-[#1A2D42] flex items-center justify-center text-white font-black text-xl shrink-0">
              {review.employee.firstName[0]}{review.employee.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">
                  {review.employee.firstName} {review.employee.lastName}
                </h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${statusMeta.bg} ${statusMeta.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {statusMeta.label}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {review.employee.employeeNo}
                {review.employee.department && ` · ${review.employee.department.name}`}
                {review.employee.position && ` · ${review.employee.position.title}`}
              </p>
              <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {review.cycleLabel} &nbsp;·&nbsp;
                  {format(new Date(review.periodStart), 'MMM d, yyyy')} – {format(new Date(review.periodEnd), 'MMM d, yyyy')}
                </span>
                {review.reviewer && (
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    Reviewer: {review.reviewer.firstName} {review.reviewer.lastName}
                  </span>
                )}
                {review.overallRating && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    Overall: <strong>{review.overallRating.toFixed(1)}</strong>/5
                    &nbsp;—&nbsp;
                    <span className={RATING_LABELS[Math.round(review.overallRating)]?.color ?? ''}>
                      {RATING_LABELS[Math.round(review.overallRating)]?.label}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {/* HR/Manager transitions */}
              {canEditHR && review.status === 'DRAFT' && (
                <Button size="sm" onClick={() => transition('IN_REVIEW')} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Clock3 className="w-3.5 h-3.5 mr-1.5" />}
                  Start Review
                </Button>
              )}
              {canEditHR && review.status === 'IN_REVIEW' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => save()} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save Draft
                  </Button>
                  <Button size="sm" onClick={() => transition('COMPLETED')} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    Complete Review
                  </Button>
                </>
              )}
              {review.status === 'COMPLETED' && !canAck && (
                <span className="text-xs text-slate-500 italic px-2">Awaiting employee acknowledgement</span>
              )}
              {/* Employee acknowledge */}
              {canAck && (
                <Button size="sm" onClick={acknowledge} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                  Acknowledge Review
                </Button>
              )}
              {review.status === 'ACKNOWLEDGED' && review.acknowledgedAt && (
                <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-3 py-1 rounded-full">
                  ✓ Acknowledged {format(new Date(review.acknowledgedAt), 'MMM d, yyyy')}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflow banner */}
      {review.status === 'DRAFT' && (
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <CircleDot className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-600">This review is in <strong>Draft</strong>. Click <strong>Start Review</strong> to begin filling in the scorecard and open it for the employee&apos;s self-evaluation.</p>
        </div>
      )}
      {review.status === 'COMPLETED' && canAck && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-700">Your manager has completed this review. Please read it carefully and click <strong>Acknowledge Review</strong> to confirm you have seen it.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-slate-200 pb-0">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-[#1A2D42] text-[#1A2D42]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab: Overview ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Strengths */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-bold text-slate-700">Strengths</CardTitle></CardHeader>
            <CardContent>
              {canEditHR ? (
                <textarea
                  value={strengths}
                  onChange={e => setStrengths(e.target.value)}
                  rows={5}
                  placeholder="Describe what the employee does well..."
                  className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A2D42]/30"
                />
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{review.strengths || <span className="text-slate-400 italic">Not yet filled in</span>}</p>
              )}
            </CardContent>
          </Card>

          {/* Areas for Improvement */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-bold text-slate-700">Areas for Improvement</CardTitle></CardHeader>
            <CardContent>
              {canEditHR ? (
                <textarea
                  value={improvementAreas}
                  onChange={e => setImprovementAreas(e.target.value)}
                  rows={5}
                  placeholder="Describe areas where the employee can improve..."
                  className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A2D42]/30"
                />
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{review.improvementAreas || <span className="text-slate-400 italic">Not yet filled in</span>}</p>
              )}
            </CardContent>
          </Card>

          {/* Score summary */}
          {avgScore !== null && (
            <Card className="sm:col-span-2">
              <CardHeader><CardTitle className="text-sm font-bold text-slate-700">Score Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 flex-wrap mb-4">
                  <div className="text-center">
                    <p className="text-4xl font-black text-[#1A2D42]">{avgScore.toFixed(1)}</p>
                    <p className="text-xs text-slate-500">out of 5</p>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1 mb-1">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={`w-5 h-5 ${i <= Math.round(avgScore) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      ))}
                    </div>
                    <p className={`text-sm font-bold ${RATING_LABELS[Math.round(avgScore)]?.color}`}>
                      {RATING_LABELS[Math.round(avgScore)]?.label}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {/* Built-in competencies */}
                  {COMPETENCIES.map(c => {
                    const score = scores[c.key] ?? 0
                    return (
                      <div key={c.key} className="flex items-center gap-3">
                        <p className="text-xs text-slate-600 w-40 shrink-0">{c.label}</p>
                        <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 rounded-full bg-[#1A2D42] transition-all"
                            style={{ width: score > 0 ? `${(score / 5) * 100}%` : '0%' }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-600 w-6 text-right">{score > 0 ? score : '—'}</span>
                      </div>
                    )
                  })}
                  {/* Custom competencies */}
                  {Object.entries(scores).filter(([k]) => isCustomKey(k)).map(([k, score]) => (
                    <div key={k} className="flex items-center gap-3">
                      <p className="text-xs text-slate-600 w-40 shrink-0 flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        {customLabel(k)}
                      </p>
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-amber-400 transition-all"
                          style={{ width: score > 0 ? `${(score / 5) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-600 w-6 text-right">{score > 0 ? score : '—'}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {canEditHR && ['IN_REVIEW'].includes(review.status) && (
            <div className="sm:col-span-2 flex justify-end gap-3">
              <Button onClick={() => save()} disabled={saving} className="bg-[#1A2D42] hover:bg-[#1A2D42]/90 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Overview
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Scorecard ── */}
      {activeTab === 'scorecard' && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  Competency Scorecard
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Rate each competency from 1 (Needs Improvement) to 5 (Outstanding)</p>
              </div>
              {canEditHR && review.status !== 'ACKNOWLEDGED' && (
                <Button onClick={() => save()} disabled={saving} size="sm" className="bg-[#1A2D42] hover:bg-[#1A2D42]/90 text-white shrink-0">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save Scores
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* ── Standard competencies ── */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Standard Competencies</p>
              <div className="space-y-2">
                {COMPETENCIES.map((comp) => (
                  <div key={comp.key} className="border border-slate-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{comp.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{comp.desc}</p>
                      </div>
                      <StarRatingInput
                        value={scores[comp.key] ?? 0}
                        onChange={v => setScores(prev => ({ ...prev, [comp.key]: v }))}
                        disabled={!canEditHR || review.status === 'ACKNOWLEDGED'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Custom competencies ── */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Custom Competencies</p>
              {Object.entries(scores).filter(([k]) => isCustomKey(k)).length === 0 && !canEditHR && (
                <p className="text-xs text-slate-400 italic py-2">No custom competencies added.</p>
              )}
              <div className="space-y-2">
                {Object.entries(scores)
                  .filter(([k]) => isCustomKey(k))
                  .map(([k]) => (
                    <div key={k} className="border border-amber-100 bg-amber-50/40 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <p className="text-sm font-semibold text-slate-800 truncate">{customLabel(k)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StarRatingInput
                            value={scores[k] ?? 0}
                            onChange={v => setScores(prev => ({ ...prev, [k]: v }))}
                            disabled={!canEditHR || review.status === 'ACKNOWLEDGED'}
                          />
                          {canEditHR && review.status !== 'ACKNOWLEDGED' && (
                            <button
                              type="button"
                              onClick={() => setScores(prev => {
                                const next = { ...prev }
                                delete next[k]
                                return next
                              })}
                              className="text-slate-300 hover:text-red-500 transition-colors ml-1"
                              title="Remove competency"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Add custom competency */}
              {canEditHR && review.status !== 'ACKNOWLEDGED' && (
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={newCompetencyLabel}
                    onChange={e => setNewCompetencyLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const label = newCompetencyLabel.trim()
                        if (!label) return
                        const key = customKey(label)
                        if (scores[key] !== undefined) return // already exists
                        setScores(prev => ({ ...prev, [key]: 0 }))
                        setNewCompetencyLabel('')
                      }
                    }}
                    placeholder="e.g. Leadership, Attendance, Punctuality…"
                    className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A2D42]/30"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const label = newCompetencyLabel.trim()
                      if (!label) return
                      const key = customKey(label)
                      if (scores[key] !== undefined) return
                      setScores(prev => ({ ...prev, [key]: 0 }))
                      setNewCompetencyLabel('')
                    }}
                    disabled={!newCompetencyLabel.trim()}
                    className="shrink-0"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              )}
            </div>

            {/* ── Average ── */}
            {avgScore !== null && (
              <div className="flex items-center justify-between bg-[#1A2D42]/5 rounded-xl px-4 py-3 border border-[#1A2D42]/10">
                <div>
                  <span className="text-sm font-bold text-[#1A2D42]">Average Score</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Across {Object.values(scores).filter(v => v > 0).length} rated competenc{Object.values(scores).filter(v => v > 0).length === 1 ? 'y' : 'ies'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} className={`w-4 h-4 ${i <= Math.round(avgScore) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                    ))}
                  </div>
                  <span className="text-base font-black text-[#1A2D42]">{avgScore.toFixed(1)}</span>
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      )}

      {/* ── Tab: Goals ── */}
      {activeTab === 'goals' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-600" />
              Goals & Objectives
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Add goal */}
            {canEditHR && review.status !== 'ACKNOWLEDGED' && (
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={newGoalTitle}
                  onChange={e => setNewGoalTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addGoal()}
                  placeholder="Add a goal or objective..."
                  className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A2D42]/30"
                />
                <input
                  type="date"
                  value={newGoalDate}
                  onChange={e => setNewGoalDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A2D42]/30"
                />
                <Button size="sm" onClick={addGoal} disabled={!newGoalTitle.trim()} className="bg-[#1A2D42] hover:bg-[#1A2D42]/90 text-white">
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            )}

            {/* Goals list */}
            {goals.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No goals set yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {goals.map(goal => (
                  <div key={goal.id} className="flex items-center gap-3 border border-slate-100 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${goal.status === 'achieved' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {goal.title}
                      </p>
                      {goal.targetDate && (
                        <p className="text-xs text-slate-400 mt-0.5">Target: {format(new Date(goal.targetDate), 'MMM d, yyyy')}</p>
                      )}
                    </div>
                    {canEditHR ? (
                      <select
                        value={goal.status}
                        onChange={e => setGoalStatus(goal.id, e.target.value as Goal['status'])}
                        className={`text-xs font-semibold border rounded-lg px-2 py-1 ${
                          goal.status === 'achieved' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                          goal.status === 'missed'   ? 'border-red-200 bg-red-50 text-red-700' :
                          'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      >
                        <option value="pending">Pending</option>
                        <option value="achieved">Achieved</option>
                        <option value="missed">Missed</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        goal.status === 'achieved' ? 'bg-emerald-100 text-emerald-700' :
                        goal.status === 'missed'   ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{goal.status}</span>
                    )}
                    {canEditHR && (
                      <button onClick={() => removeGoal(goal.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canEditHR && review.status !== 'ACKNOWLEDGED' && goals.length > 0 && (
              <div className="flex justify-end">
                <Button onClick={() => save()} disabled={saving} className="bg-[#1A2D42] hover:bg-[#1A2D42]/90 text-white">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Goals
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Comments ── */}
      {activeTab === 'comments' && (
        <div className="space-y-4">
          {/* Manager comment */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-bold text-slate-700">Manager&apos;s Overall Comment</CardTitle></CardHeader>
            <CardContent>
              {canEditHR ? (
                <>
                  <textarea
                    value={managerComment}
                    onChange={e => setManagerComment(e.target.value)}
                    rows={5}
                    placeholder="Provide an overall summary and recommendations..."
                    className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A2D42]/30"
                  />
                  {review.status === 'IN_REVIEW' && (
                    <div className="flex justify-end mt-3">
                      <Button size="sm" onClick={() => save()} disabled={saving} className="bg-[#1A2D42] hover:bg-[#1A2D42]/90 text-white">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                        Save
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{review.managerComment || <span className="text-slate-400 italic">No comment yet</span>}</p>
              )}
            </CardContent>
          </Card>

          {/* Employee self-evaluation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-700">Employee Self-Evaluation</CardTitle>
              {canSelfEval && <p className="text-xs text-slate-500 mt-0.5">Share your perspective on your own performance this cycle</p>}
            </CardHeader>
            <CardContent>
              {canSelfEval ? (
                <>
                  <textarea
                    value={employeeComment}
                    onChange={e => setEmployeeComment(e.target.value)}
                    rows={5}
                    placeholder="Describe your achievements, challenges, and areas you'd like to develop..."
                    className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A2D42]/30"
                  />
                  <div className="flex justify-end mt-3">
                    <Button size="sm" onClick={saveEmployeeComment} disabled={saving} className="bg-[#1A2D42] hover:bg-[#1A2D42]/90 text-white">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                      Save Self-Evaluation
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {review.employeeComment || (
                    <span className="text-slate-400 italic">
                      {review.status === 'DRAFT' ? 'Available once review is started' : 'No self-evaluation submitted'}
                    </span>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
