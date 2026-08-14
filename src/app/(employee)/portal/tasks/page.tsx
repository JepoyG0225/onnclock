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
 * uses works here.
 *
 * Layout follows the mobile reference: a week strip for picking a day, a filter
 * pill, and cards carrying a completion ring. The week strip filters by DUE
 * DATE, which is the only date on a task an employee cares about.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, Circle, AlertTriangle, Loader2,
  MessageSquare, ChevronLeft, ChevronRight, ListChecks,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PortalTaskDetailDialog } from '@/components/employee/PortalTaskDetailDialog'

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

/** `bar` drives the card's left priority stripe, which replaced the chip. */
const PRIORITY_STYLE: Record<TaskRow['priority'], { label: string; bar: string }> = {
  URGENT: { label: 'Urgent', bar: '#ef4444' },
  HIGH:   { label: 'High',   bar: '#f97316' },
  MEDIUM: { label: 'Medium', bar: '#f59e0b' },
  LOW:    { label: 'Low',    bar: '#e2e8f0' },
}

const NAVY = '#032b63'
const TEAL = '#1b6a6e'
const ORANGE = '#ff5900'

/**
 * Day-precision key in the viewer's own timezone.
 *
 * dueDate arrives as an ISO string for a DATE-like value; comparing raw
 * timestamps would mark a task due today as overdue for anyone west of UTC.
 */
function dayKey(d: Date): number {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate()
}

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  // Monday-first, matching the rest of the product's week handling.
  const shift = (out.getDay() + 6) % 7
  out.setDate(out.getDate() - shift)
  return out
}

/** Small circular progress indicator driven by checklist completion. */
function ProgressRing({ done, total, isDone }: { done: number; total: number; isDone: boolean }) {
  const pct = isDone ? 100 : total > 0 ? Math.round((done / total) * 100) : 0
  const r = 16
  const c = 2 * Math.PI * r
  return (
    <div className="relative w-11 h-11 shrink-0">
      <svg viewBox="0 0 40 40" className="w-11 h-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
        <circle
          cx="20" cy="20" r={r} fill="none"
          stroke={isDone ? '#10b981' : TEAL}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-700">
        {pct}%
      </span>
    </div>
  )
}

type Filter = 'todo' | 'in_progress' | 'done'

export default function PortalTasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [statuses, setStatuses] = useState<TaskStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('todo')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  /** null = no day selected, i.e. show every task rather than one day. */
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Always fetch done tasks too — the filter is applied client-side so
      // toggling between All / Open / Done doesn't cost a round trip.
      const res = await fetch('/api/tasks?mine=1&includeDone=1')
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
  }, [])

  useEffect(() => { load() }, [load])

  const doneStatus     = useMemo(() => statuses.find(s => s.category === 'DONE'), [statuses])
  const startStatus    = useMemo(
    () => statuses.find(s => s.isDefault && s.category !== 'DONE') ?? statuses.find(s => s.category === 'TODO'),
    [statuses],
  )
  const progressStatus = useMemo(() => statuses.find(s => s.category === 'IN_PROGRESS'), [statuses])

  async function setStatus(task: TaskRow, statusId: string) {
    if (!statusId || statusId === task.statusId) return
    setSavingId(task.id)
    const previous = tasks
    const next = statuses.find(s => s.id === statusId)
    if (next) setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, statusId, status: next } : t)))
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
      toast.success(next?.category === 'DONE' ? 'Task completed' : `Moved to ${next?.name}`)
    } catch (err) {
      setTasks(previous)
      toast.error(err instanceof Error ? err.message : 'Could not update task')
    } finally {
      setSavingId(null)
    }
  }

  const todayKey = dayKey(new Date())

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [weekStart])

  /** Tasks due on each day of the shown week, for the little count dots. */
  const countByDay = useMemo(() => {
    const m = new Map<number, number>()
    for (const t of tasks) {
      if (!t.dueDate || t.status.category === 'DONE') continue
      const k = dayKey(new Date(t.dueDate))
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [tasks])

  const visible = useMemo(() => {
    let rows = tasks
    if (filter === 'todo') rows = rows.filter(t => t.status.category === 'TODO')
    if (filter === 'in_progress') rows = rows.filter(t => t.status.category === 'IN_PROGRESS')
    if (filter === 'done') rows = rows.filter(t => t.status.category === 'DONE')
    if (selectedDay !== null) {
      rows = rows.filter(t => t.dueDate && dayKey(new Date(t.dueDate)) === selectedDay)
    }
    return [...rows].sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
      return ad - bd
    })
  }, [tasks, filter, selectedDay])

  const openCount    = tasks.filter(t => t.status.category !== 'DONE').length
  const overdueCount = tasks.filter(
    t => t.status.category !== 'DONE' && t.dueDate && dayKey(new Date(t.dueDate)) < todayKey,
  ).length

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-3xl mx-auto space-y-4">

      {/* Header */}
      <header>
        <h1 className="text-[22px] lg:text-2xl font-black tracking-tight" style={{ color: NAVY }}>
          My Tasks
        </h1>
        <p className="text-[13px] text-slate-400 font-semibold mt-0.5">
          {loading
            ? 'Loading…'
            : openCount === 0
              ? 'You’re all caught up'
              : `${openCount} open${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`}
        </p>
      </header>

      {/* Week strip */}
      <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-3">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <button
            type="button"
            onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-[12px] font-black text-slate-700">
            {weekStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
          <button
            type="button"
            onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(d => {
            const k = dayKey(d)
            const isToday = k === todayKey
            const isSelected = selectedDay === k
            const due = countByDay.get(k) ?? 0
            return (
              <button
                key={k}
                type="button"
                // Tapping the selected day clears it, so there's always a way
                // back to "everything" without hunting for a reset control.
                onClick={() => setSelectedDay(cur => (cur === k ? null : k))}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 rounded-2xl transition-colors',
                  !isSelected && !isToday && 'hover:bg-slate-50',
                )}
                style={
                  isSelected
                    ? { background: ORANGE }
                    // Today gets a soft orange wash and orange type when it is
                    // not the selected day, so "what day is it" and "what day
                    // am I filtering" stay tellable apart: tint vs solid fill.
                    : isToday
                      ? { background: 'rgba(255,89,0,0.10)' }
                      : undefined
                }
              >
                <span className={cn(
                  'text-[10px] font-bold',
                  isSelected ? 'text-white/70' : isToday ? '' : 'text-slate-400',
                )} style={!isSelected && isToday ? { color: ORANGE } : undefined}>
                  {d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3)}
                </span>
                <span className={cn(
                  'text-[15px] font-black tabular-nums',
                  isSelected ? 'text-white' : isToday ? '' : 'text-slate-800',
                )} style={!isSelected && isToday ? { color: ORANGE } : undefined}>
                  {d.getDate()}
                </span>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: due > 0 ? (isSelected ? '#ffffff' : '#ff5900') : 'transparent',
                  }}
                />
              </button>
            )
          })}
        </div>
      </section>

      {/* Filter pills */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { id: 'todo', label: 'To Do' },
          { id: 'in_progress', label: 'In Progress' },
          { id: 'done', label: 'Done' },
        ] as const).map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'min-w-0 truncate text-[11px] font-black px-2 py-2 rounded-full border transition-colors sm:text-[12px]',
              filter === f.id ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200',
            )}
            style={filter === f.id ? { background: NAVY } : undefined}
          >
            {f.label}
          </button>
        ))}
        {selectedDay !== null && (
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className="col-span-3 justify-self-end text-[11px] font-bold text-slate-400 hover:text-slate-700"
          >
            Clear day
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm font-semibold">Loading your tasks…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-3xl bg-white border border-slate-200 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-800">{error}</p>
          <button
            onClick={load}
            className="mt-4 text-xs font-black px-4 py-2 rounded-lg text-white"
            style={{ background: NAVY }}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="rounded-3xl bg-white border border-slate-200 p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            {tasks.length === 0
              ? <ListChecks className="w-7 h-7 text-emerald-500" />
              : <CheckCircle2 className="w-7 h-7 text-emerald-500" />}
          </div>
          <p className="text-base font-black text-slate-900">
            {tasks.length === 0
              ? 'No tasks assigned'
              : selectedDay !== null
                ? 'Nothing due this day'
                : 'Nothing here'}
          </p>
          <p className="text-sm text-slate-500 mt-1.5 max-w-xs mx-auto">
            {tasks.length === 0
              ? 'When someone assigns you a task it will show up here.'
              : 'Try another day or switch the filter.'}
          </p>
        </div>
      )}

      {/* Task cards */}
      {!loading && !error && visible.length > 0 && (
        <div className="space-y-2.5">
          {visible.map(task => {
            const isDone = task.status.category === 'DONE'
            const saving = savingId === task.id
            const pri = PRIORITY_STYLE[task.priority]
            const overdue = !isDone && task.dueDate && dayKey(new Date(task.dueDate)) < todayKey
            const toggleTarget = isDone ? (startStatus?.id ?? '') : (doneStatus?.id ?? '')
            return (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTaskId(task.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedTaskId(task.id)
                  }
                }}
                className={cn(
                  // Borderless with a soft shadow instead of a hard 1px outline —
                  // a stack of outlined boxes reads as a table, not a feed. The
                  // priority stripe on the left carries the urgency signal that
                  // used to need its own chip.
                  'relative rounded-[22px] bg-white p-4 pl-5 overflow-hidden transition-all',
                  'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]',
                  saving && 'opacity-60',
                  isDone && 'bg-slate-50/60',
                )}
              >
                <span
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ background: isDone ? '#cbd5e1' : pri.bar }}
                />

                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    disabled={saving || !toggleTarget}
                    onClick={event => { event.stopPropagation(); void setStatus(task, toggleTarget) }}
                    onKeyDown={event => event.stopPropagation()}
                    className="shrink-0 mt-0.5 disabled:opacity-40"
                    aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
                  >
                    {saving ? <Loader2 className="w-[22px] h-[22px] text-slate-400 animate-spin" />
                      : isDone ? <CheckCircle2 className="w-[22px] h-[22px] text-emerald-500" />
                      : <Circle className="w-[22px] h-[22px] text-slate-300 hover:text-slate-500 transition-colors" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'text-[15px] font-bold leading-snug tracking-[-0.01em]',
                      isDone ? 'text-slate-400 line-through' : 'text-slate-900',
                    )}>
                      {task.title}
                    </p>
                    {task.description && !isDone && (
                      <p className="text-[12.5px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    {/* Meta on one quiet line — status as a dot rather than a
                        third pill, so the row doesn't compete with the title. */}
                    <div className="flex items-center gap-2.5 flex-wrap mt-2.5">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: task.status.color }} />
                        {task.status.name}
                      </span>
                      {task.dueDate && (
                        <span className={cn(
                          'text-[11px] font-bold',
                          overdue ? 'text-red-600' : 'text-slate-400',
                        )}>
                          {overdue ? 'Overdue · ' : 'Due '}
                          {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {task.checklistTotal > 0 && (
                        <span className="text-[11px] font-bold text-slate-400">
                          {task.checklistDone}/{task.checklistTotal}
                        </span>
                      )}
                      {task.commentCount > 0 && (
                        <span className="text-[11px] font-bold text-slate-400 inline-flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {task.commentCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {(task.checklistTotal > 0 || isDone) && (
                    <ProgressRing done={task.checklistDone} total={task.checklistTotal} isDone={isDone} />
                  )}
                </div>

                {!isDone && progressStatus && task.statusId !== progressStatus.id && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={event => { event.stopPropagation(); void setStatus(task, progressStatus.id) }}
                    onKeyDown={event => event.stopPropagation()}
                    className="mt-3 ml-[34px] text-[11px] font-black inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full disabled:opacity-40"
                    style={{ color: TEAL, background: 'rgba(27,106,110,0.08)' }}
                  >
                    Start working
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {selectedTaskId && (
        <PortalTaskDetailDialog
          taskId={selectedTaskId}
          statuses={statuses}
          onClose={() => setSelectedTaskId(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}
