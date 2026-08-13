'use client'

/**
 * My Tasks — the employee-facing view of the Task Management module.
 *
 * Reuses GET /api/tasks?mine=1, which already filters to the tasks assigned to
 * the signed-in actor and returns `viewerEmployeeId` and the company's status
 * list. No portal-specific endpoint is needed, and reusing it means the portal
 * can never drift from what the admin board shows.
 *
 * Employees may advance their own tasks: canEditTask() in src/lib/tasks/access.ts
 * grants edit to anyone assigned to the task, so the same PATCH the admin UI
 * uses works here. Tasks the viewer cannot edit render read-only.
 *
 * Grouped by urgency rather than by status, because the question an employee
 * opens this to answer is "what do I need to do now", not "what column is this
 * in".
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, Circle, Clock3, AlertTriangle, CalendarDays,
  Inbox, Loader2, ChevronRight, Flag,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TaskStatus {
  id: string
  name: string
  color: string
  category: 'TODO' | 'IN_PROGRESS' | 'DONE'
  isDefault: boolean
}

interface TaskRow {
  id: string
  key: string
  title: string
  description: string | null
  statusId: string
  status: TaskStatus
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  dueDate: string | null
  checklistTotal: number
  checklistDone: number
  commentCount: number
  assignees: Array<{ id: string; firstName: string; lastName: string }>
}

const PRIORITY_STYLE: Record<TaskRow['priority'], { label: string; className: string }> = {
  URGENT: { label: 'Urgent', className: 'bg-red-100 text-red-700' },
  HIGH:   { label: 'High',   className: 'bg-orange-100 text-orange-700' },
  MEDIUM: { label: 'Medium', className: 'bg-amber-100 text-amber-800' },
  LOW:    { label: 'Low',    className: 'bg-slate-100 text-slate-600' },
}

/**
 * Day-precision comparison in the viewer's own timezone.
 *
 * dueDate arrives as an ISO string for a DATE-like value; comparing raw
 * timestamps would mark a task due today as overdue for anyone west of UTC.
 * Reducing both sides to a local Y-M-D number avoids that entirely.
 */
function dayNumber(d: Date): number {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate()
}

type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'none'

const BUCKET_META: Record<Bucket, { label: string; icon: typeof Clock3; tone: string }> = {
  overdue: { label: 'Overdue',    icon: AlertTriangle, tone: 'text-red-600' },
  today:   { label: 'Due today',  icon: Clock3,        tone: 'text-orange-600' },
  week:    { label: 'This week',  icon: CalendarDays,  tone: 'text-blue-600' },
  later:   { label: 'Later',      icon: CalendarDays,  tone: 'text-slate-500' },
  none:    { label: 'No due date', icon: Inbox,        tone: 'text-slate-400' },
}
const BUCKET_ORDER: Bucket[] = ['overdue', 'today', 'week', 'later', 'none']

function bucketOf(task: TaskRow, todayNum: number, weekEndNum: number): Bucket {
  if (!task.dueDate) return 'none'
  const n = dayNumber(new Date(task.dueDate))
  if (n < todayNum) return 'overdue'
  if (n === todayNum) return 'today'
  if (n <= weekEndNum) return 'week'
  return 'later'
}

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function PortalTasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [statuses, setStatuses] = useState<TaskStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // includeDone is driven by the toggle so the default view is only what's
      // still outstanding.
      const res = await fetch(`/api/tasks?mine=1&includeDone=${showDone ? '1' : '0'}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        // 403 notEntitled is the HRIS-Pro gate; show its message rather than a
        // generic failure so the employee knows it isn't broken.
        throw new Error(body?.error || `Could not load tasks (${res.status})`)
      }
      const data = await res.json()
      setTasks(data.tasks ?? [])
      setStatuses(data.statuses ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tasks')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [showDone])

  useEffect(() => { load() }, [load])

  const doneStatus = useMemo(
    () => statuses.find(s => s.category === 'DONE'),
    [statuses],
  )
  const startStatus = useMemo(
    () => statuses.find(s => s.isDefault && s.category !== 'DONE') ?? statuses.find(s => s.category === 'TODO'),
    [statuses],
  )
  const progressStatus = useMemo(
    () => statuses.find(s => s.category === 'IN_PROGRESS'),
    [statuses],
  )

  async function setStatus(task: TaskRow, statusId: string) {
    if (!statusId || statusId === task.statusId) return
    setSavingId(task.id)
    // Optimistic — the list reorders immediately, which is the whole point of
    // tapping the control. Rolled back if the request fails.
    const previous = tasks
    const next = statuses.find(s => s.id === statusId)
    if (next) {
      setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, statusId, status: next } : t)))
    }
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Could not update task')
      }
      // Re-fetch so a completed task leaves the list when Done is hidden.
      if (next?.category === 'DONE' && !showDone) {
        setTasks(ts => ts.filter(t => t.id !== task.id))
      }
      toast.success(next?.category === 'DONE' ? 'Task completed' : `Moved to ${next?.name}`)
    } catch (err) {
      setTasks(previous)
      toast.error(err instanceof Error ? err.message : 'Could not update task')
    } finally {
      setSavingId(null)
    }
  }

  const { grouped, openCount, overdueCount } = useMemo(() => {
    const now = new Date()
    const todayNum = dayNumber(now)
    const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndNum = dayNumber(weekEnd)

    const g: Record<Bucket, TaskRow[]> = { overdue: [], today: [], week: [], later: [], none: [] }
    let open = 0
    for (const t of tasks) {
      if (t.status.category !== 'DONE') open++
      g[bucketOf(t, todayNum, weekEndNum)].push(t)
    }
    for (const b of BUCKET_ORDER) {
      g[b].sort((a, c) => {
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
        const cd = c.dueDate ? new Date(c.dueDate).getTime() : Infinity
        return ad - cd
      })
    }
    return { grouped: g, openCount: open, overdueCount: g.overdue.filter(t => t.status.category !== 'DONE').length }
  }, [tasks])

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[22px] lg:text-2xl font-black text-slate-900 tracking-tight">My Tasks</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {loading
            ? 'Loading…'
            : openCount === 0
              ? 'Nothing outstanding — you’re all caught up.'
              : `${openCount} open${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`}
        </p>
      </div>

      {/* Done toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setShowDone(v => !v)}
          className={cn(
            'text-xs font-bold px-3 py-1.5 rounded-full border transition-colors',
            showDone
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
          )}
        >
          {showDone ? 'Hiding nothing' : 'Show completed'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading your tasks…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl bg-white border border-slate-200 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-800">{error}</p>
          <button
            onClick={load}
            className="mt-4 text-xs font-bold px-4 py-2 rounded-lg bg-slate-900 text-white"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-base font-bold text-slate-900">No tasks assigned</p>
          <p className="text-sm text-slate-500 mt-1.5 max-w-xs mx-auto">
            When someone assigns you a task it will show up here, sorted by what’s due first.
          </p>
        </div>
      )}

      {!loading && !error && tasks.length > 0 && (
        <div className="space-y-6">
          {BUCKET_ORDER.map(bucket => {
            const rows = grouped[bucket]
            if (rows.length === 0) return null
            const meta = BUCKET_META[bucket]
            return (
              <section key={bucket}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <meta.icon className={cn('w-4 h-4', meta.tone)} strokeWidth={2.4} />
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    {meta.label}
                  </h2>
                  <span className="text-xs font-bold text-slate-400">{rows.length}</span>
                </div>

                <div className="space-y-2">
                  {rows.map(task => {
                    const isDone = task.status.category === 'DONE'
                    const saving = savingId === task.id
                    const pri = PRIORITY_STYLE[task.priority]
                    // Tapping the circle toggles between done and a sensible
                    // "not done" status, so completing a task is one tap.
                    const toggleTarget = isDone
                      ? (startStatus?.id ?? '')
                      : (doneStatus?.id ?? '')
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          'rounded-2xl bg-white border border-slate-200 p-3.5 flex gap-3 transition-opacity',
                          saving && 'opacity-60',
                          isDone && 'bg-slate-50',
                        )}
                      >
                        <button
                          type="button"
                          disabled={saving || !toggleTarget}
                          onClick={() => setStatus(task, toggleTarget)}
                          className="shrink-0 mt-0.5 disabled:opacity-40"
                          aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
                        >
                          {saving ? (
                            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                          ) : isDone ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                          ) : (
                            <Circle className="w-6 h-6 text-slate-300 hover:text-slate-400 transition-colors" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn(
                              'text-sm font-bold leading-snug',
                              isDone ? 'text-slate-400 line-through' : 'text-slate-900',
                            )}>
                              {task.title}
                            </p>
                            <span className="text-[10px] font-bold text-slate-400 shrink-0 mt-0.5">
                              {task.key}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap mt-2">
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${task.status.color}1a`, color: task.status.color }}
                            >
                              {task.status.name}
                            </span>
                            {task.priority !== 'LOW' && (
                              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1', pri.className)}>
                                <Flag className="w-2.5 h-2.5" />
                                {pri.label}
                              </span>
                            )}
                            {task.dueDate && (
                              <span className={cn(
                                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                                bucket === 'overdue' && !isDone
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-slate-100 text-slate-600',
                              )}>
                                {formatDue(task.dueDate)}
                              </span>
                            )}
                            {task.checklistTotal > 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                {task.checklistDone}/{task.checklistTotal}
                              </span>
                            )}
                          </div>

                          {/* In-progress shortcut, only when the company has such a status
                              and the task isn't already there or done. */}
                          {!isDone && progressStatus && task.statusId !== progressStatus.id && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => setStatus(task, progressStatus.id)}
                              className="mt-2.5 text-[11px] font-bold text-blue-600 inline-flex items-center gap-0.5 disabled:opacity-40"
                            >
                              Start working
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
