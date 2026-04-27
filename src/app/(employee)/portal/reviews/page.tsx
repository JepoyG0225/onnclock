'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  BarChart3, ChevronRight, Star, CheckCircle2,
  Loader2, AlertCircle, MessageSquare, X, Save,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ReviewSummary {
  id: string
  cycleLabel: string
  periodStart: string
  periodEnd: string
  status: 'DRAFT' | 'IN_REVIEW' | 'COMPLETED' | 'ACKNOWLEDGED'
  overallRating: number | null
  reviewer: { id: string; firstName: string; lastName: string } | null
  createdAt: string
}

interface Goal {
  id: string
  title: string
  targetDate?: string | null
  status: 'pending' | 'achieved' | 'missed'
}

interface ReviewDetail extends ReviewSummary {
  strengths: string | null
  improvementAreas: string | null
  managerComment: string | null
  employeeComment: string | null
  competencyScores: Record<string, number> | null
  goals: Goal[] | null
  completedAt: string | null
  acknowledgedAt: string | null
  employee: {
    id: string; firstName: string; lastName: string
    employeeNo: string | null; photoUrl: string | null
    department?: { name: string } | null
    position?: { title: string } | null
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const COMPETENCIES = [
  { key: 'jobKnowledge',   label: 'Job Knowledge' },
  { key: 'qualityOfWork',  label: 'Quality of Work' },
  { key: 'productivity',   label: 'Productivity' },
  { key: 'communication',  label: 'Communication' },
  { key: 'teamwork',       label: 'Teamwork' },
  { key: 'initiative',     label: 'Initiative' },
  { key: 'reliability',    label: 'Reliability' },
]

// Helper — custom competency keys are prefixed with "custom:"
function isCustomKey(key: string) { return key.startsWith('custom:') }
function customLabel(key: string) { return key.slice('custom:'.length) }

const RATING_LABELS: Record<number, string> = {
  1: 'Needs Improvement',
  2: 'Below Expectations',
  3: 'Meets Expectations',
  4: 'Exceeds Expectations',
  5: 'Outstanding',
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'secondary' | 'outline' | 'default' | 'destructive'; color: string }> = {
  DRAFT:        { label: 'Draft',        variant: 'secondary', color: 'text-gray-500' },
  IN_REVIEW:    { label: 'In Review',    variant: 'default',   color: 'text-blue-600' },
  COMPLETED:    { label: 'Completed',    variant: 'default',   color: 'text-green-600' },
  ACKNOWLEDGED: { label: 'Acknowledged', variant: 'outline',   color: 'text-purple-600' },
}

// ─── Star display ──────────────────────────────────────────────────────────────
function StarDisplay({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn('w-4 h-4', i < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200')}
        />
      ))}
    </div>
  )
}

// ─── Goal status badge ─────────────────────────────────────────────────────────
function GoalBadge({ status }: { status: Goal['status'] }) {
  const map = {
    pending:  'bg-gray-100 text-gray-600',
    achieved: 'bg-green-100 text-green-700',
    missed:   'bg-red-100 text-red-600',
  }
  return (
    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', map[status])}>
      {status}
    </span>
  )
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────
function ReviewDrawer({
  reviewId,
  onClose,
  onAcknowledged,
}: {
  reviewId: string
  onClose: () => void
  onAcknowledged: () => void
}) {
  const [review, setReview] = useState<ReviewDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Self-eval state
  const [selfEval, setSelfEval] = useState('')
  const [savingEval, setSavingEval] = useState(false)
  const [evalSaved, setEvalSaved] = useState(false)

  // Acknowledge state
  const [acking, setAcking] = useState(false)
  const [ackError, setAckError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/performance-reviews/${reviewId}`)
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Failed to load review'); return }
        setReview(data.review)
        setSelfEval(data.review.employeeComment ?? '')
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [reviewId])

  async function saveEval() {
    if (!review) return
    setSavingEval(true)
    setEvalSaved(false)
    try {
      const res = await fetch(`/api/performance-reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeComment: selfEval }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to save'); return }
      setReview(prev => prev ? { ...prev, employeeComment: data.review.employeeComment } : prev)
      setEvalSaved(true)
      setTimeout(() => setEvalSaved(false), 3000)
    } finally {
      setSavingEval(false)
    }
  }

  async function acknowledge() {
    if (!review) return
    setAcking(true)
    setAckError('')
    try {
      const res = await fetch(`/api/performance-reviews/${review.id}/acknowledge`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setAckError(data.error || 'Failed to acknowledge'); return }
      setReview(prev => prev ? { ...prev, status: 'ACKNOWLEDGED', acknowledgedAt: data.review.acknowledgedAt } : prev)
      onAcknowledged()
    } finally {
      setAcking(false)
    }
  }

  const canSelfEval = review && ['IN_REVIEW', 'COMPLETED'].includes(review.status)
  const canAcknowledge = review?.status === 'COMPLETED'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom duration-250 md:inset-y-0 md:right-0 md:left-auto md:w-[520px] md:rounded-none md:rounded-l-2xl md:max-h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#1A2D42]" />
            <span className="font-bold text-[#1A2D42]">Performance Review</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 m-5 p-4 bg-red-50 rounded-xl text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && review && (
            <div className="px-5 py-4 space-y-5 pb-32">
              {/* Cycle info */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h2 className="text-lg font-bold text-[#1A2D42]">{review.cycleLabel}</h2>
                  <Badge
                    className={cn(
                      'shrink-0 text-xs',
                      review.status === 'IN_REVIEW'    && 'bg-blue-100 text-blue-700 border-blue-200',
                      review.status === 'COMPLETED'    && 'bg-green-100 text-green-700 border-green-200',
                      review.status === 'ACKNOWLEDGED' && 'bg-purple-100 text-purple-700 border-purple-200',
                      review.status === 'DRAFT'        && 'bg-gray-100 text-gray-600 border-gray-200',
                    )}
                    variant="outline"
                  >
                    {STATUS_CONFIG[review.status].label}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500">
                  {format(new Date(review.periodStart), 'MMM d, yyyy')} – {format(new Date(review.periodEnd), 'MMM d, yyyy')}
                </p>
                {review.reviewer && (
                  <p className="text-xs text-gray-400 mt-1">
                    Reviewer: {review.reviewer.firstName} {review.reviewer.lastName}
                  </p>
                )}
              </div>

              {/* Overall rating */}
              {review.overallRating != null && (
                <div className="bg-[#1A2D42]/5 rounded-xl p-4 flex items-center gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Overall Rating</p>
                    <StarDisplay rating={review.overallRating} />
                    <p className="text-xs text-gray-500 mt-1">{RATING_LABELS[Math.round(review.overallRating)]} ({review.overallRating.toFixed(1)})</p>
                  </div>
                </div>
              )}

              {/* Competency scores */}
              {review.competencyScores && Object.keys(review.competencyScores).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[#1A2D42] mb-3">Competency Scores</h3>
                  <div className="space-y-2.5">
                    {/* Built-in */}
                    {COMPETENCIES.map(c => {
                      const score = review.competencyScores?.[c.key]
                      if (score == null) return null
                      return (
                        <div key={c.key} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-gray-600 min-w-0 flex-1">{c.label}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(v => (
                                <div
                                  key={v}
                                  className={cn(
                                    'w-2 h-6 rounded-sm',
                                    v <= score
                                      ? score >= 4 ? 'bg-green-500' : score >= 3 ? 'bg-blue-500' : 'bg-orange-400'
                                      : 'bg-gray-100'
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-xs font-bold text-gray-500 w-4">{score}</span>
                          </div>
                        </div>
                      )
                    })}
                    {/* Custom */}
                    {Object.entries(review.competencyScores)
                      .filter(([k]) => isCustomKey(k))
                      .map(([k, score]) => (
                        <div key={k} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-gray-600 min-w-0 flex-1 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            {customLabel(k)}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(v => (
                                <div
                                  key={v}
                                  className={cn(
                                    'w-2 h-6 rounded-sm',
                                    v <= score
                                      ? 'bg-amber-400'
                                      : 'bg-gray-100'
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-xs font-bold text-gray-500 w-4">{score}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Strengths */}
              {review.strengths && (
                <div>
                  <h3 className="text-sm font-semibold text-[#1A2D42] mb-1.5">Strengths</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap bg-green-50 rounded-xl p-3">{review.strengths}</p>
                </div>
              )}

              {/* Improvement areas */}
              {review.improvementAreas && (
                <div>
                  <h3 className="text-sm font-semibold text-[#1A2D42] mb-1.5">Areas for Improvement</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap bg-orange-50 rounded-xl p-3">{review.improvementAreas}</p>
                </div>
              )}

              {/* Manager comment */}
              {review.managerComment && (
                <div>
                  <h3 className="text-sm font-semibold text-[#1A2D42] mb-1.5">Manager Comments</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap bg-blue-50 rounded-xl p-3">{review.managerComment}</p>
                </div>
              )}

              {/* Goals */}
              {review.goals && review.goals.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[#1A2D42] mb-2">Goals</h3>
                  <div className="space-y-2">
                    {review.goals.map(g => (
                      <div key={g.id} className="flex items-start justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700 font-medium">{g.title}</p>
                          {g.targetDate && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Target: {format(new Date(g.targetDate), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                        <GoalBadge status={g.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="border-t" />

              {/* Self-evaluation */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-[#1A2D42]" />
                  <h3 className="text-sm font-semibold text-[#1A2D42]">Your Self-Evaluation</h3>
                </div>

                {canSelfEval ? (
                  <>
                    <textarea
                      value={selfEval}
                      onChange={e => setSelfEval(e.target.value)}
                      placeholder="Share your thoughts on your performance, achievements, and areas where you'd like to grow…"
                      rows={4}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-[#1A2D42]/20 focus:border-[#1A2D42]/40 transition-shadow"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className={cn('text-xs transition-colors', evalSaved ? 'text-green-600' : 'text-gray-400')}>
                        {evalSaved ? '✓ Saved' : 'Your comments are visible to your reviewer'}
                      </span>
                      <Button
                        size="sm"
                        onClick={saveEval}
                        disabled={savingEval || selfEval === (review.employeeComment ?? '')}
                      >
                        {savingEval ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                        Save
                      </Button>
                    </div>
                  </>
                ) : review.employeeComment ? (
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap bg-purple-50 rounded-xl p-3">{review.employeeComment}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    {review.status === 'DRAFT'
                      ? 'Self-evaluation opens when the review is started.'
                      : 'No self-evaluation submitted.'}
                  </p>
                )}
              </div>

              {/* Acknowledged timestamp */}
              {review.status === 'ACKNOWLEDGED' && review.acknowledgedAt && (
                <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 rounded-xl px-3 py-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Acknowledged on {format(new Date(review.acknowledgedAt), 'MMM d, yyyy')}
                </div>
              )}

              {/* Ack error */}
              {ackError && (
                <p className="text-sm text-red-500">{ackError}</p>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer — Acknowledge button */}
        {!loading && !error && canAcknowledge && (
          <div className="shrink-0 border-t bg-white px-5 py-4">
            <Button
              className="w-full"
              style={{ background: 'linear-gradient(135deg,#1A2D42,#2E4156)' }}
              onClick={acknowledge}
              disabled={acking}
            >
              {acking
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Acknowledging…</>
                : <><CheckCircle2 className="w-4 h-4 mr-2" />Acknowledge Review</>
              }
            </Button>
            <p className="text-xs text-gray-400 text-center mt-2">
              Confirming you have read and understood this review
            </p>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function PortalReviewsPage() {
  const [reviews, setReviews] = useState<ReviewSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/performance-reviews/my')
      const data = await res.json()
      setReviews(data.reviews ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleAcknowledged() {
    // refresh list so status updates
    load()
  }

  const empty = !loading && reviews.length === 0

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#1A2D42]/10 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-[#1A2D42]" />
        </div>
        <div>
          <h1 className="text-base font-bold text-[#1A2D42] leading-none">Performance Reviews</h1>
          <p className="text-xs text-gray-500 mt-0.5">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        )}

        {empty && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-500">No reviews yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Your performance reviews will appear here once a manager has been assigned to your review.
            </p>
          </div>
        )}

        {reviews.map(review => {
          const cfg = STATUS_CONFIG[review.status]
          const hasPending = review.status === 'IN_REVIEW'
          const canAck    = review.status === 'COMPLETED'

          return (
            <button
              key={review.id}
              onClick={() => setSelectedId(review.id)}
              className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-[#1A2D42] text-sm truncate">{review.cycleLabel}</span>
                    {(hasPending || canAck) && (
                      <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0 animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {format(new Date(review.periodStart), 'MMM d')} – {format(new Date(review.periodEnd), 'MMM d, yyyy')}
                  </p>
                  {review.reviewer && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      By {review.reviewer.firstName} {review.reviewer.lastName}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[11px]',
                      review.status === 'IN_REVIEW'    && 'bg-blue-50 text-blue-700 border-blue-200',
                      review.status === 'COMPLETED'    && 'bg-green-50 text-green-700 border-green-200',
                      review.status === 'ACKNOWLEDGED' && 'bg-purple-50 text-purple-700 border-purple-200',
                      review.status === 'DRAFT'        && 'bg-gray-50 text-gray-500 border-gray-200',
                    )}
                  >
                    {cfg.label}
                  </Badge>
                  {review.overallRating != null && (
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-bold text-gray-600">{review.overallRating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action hint */}
              {(hasPending || canAck) && (
                <div className={cn(
                  'mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium',
                  hasPending ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'
                )}>
                  <span>{hasPending ? 'Add your self-evaluation' : 'Tap to acknowledge'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Detail drawer */}
      {selectedId && (
        <ReviewDrawer
          reviewId={selectedId}
          onClose={() => setSelectedId(null)}
          onAcknowledged={handleAcknowledged}
        />
      )}
    </div>
  )
}
