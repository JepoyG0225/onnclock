'use client'

/**
 * All Tasks — the primary surface of the module.
 *
 * One data fetch feeds four views (Board / List / Table / Calendar); the view
 * switcher only changes presentation, never which rows are loaded, so
 * switching can't silently change what you're looking at.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  LayoutGrid, List as ListIcon, Table2, CalendarDays, Plus, Search, X, Loader2,
  Settings2, CheckCircle2, Clock, SlidersHorizontal, RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { toast } from 'sonner'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { TaskTableView } from '@/components/tasks/TaskTableView'
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer'
import { StatusManagerDialog } from '@/components/tasks/StatusManagerDialog'
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog'
import { AvatarStack } from '@/components/tasks/Avatars'
import {
  PRIORITY_STYLES, formatDueDate, isOverdue,
  type EmployeeBrief, type LabelBrief, type Priority, type TaskRow, type TaskStatus,
} from '@/components/tasks/types'

type ViewMode = 'board' | 'list' | 'table' | 'calendar'

const VIEWS = [
  { id: 'board',    label: 'Board',    icon: LayoutGrid },
  { id: 'list',     label: 'List',     icon: ListIcon },
  { id: 'table',    label: 'Table',    icon: Table2 },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
] as const

export default function TasksPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [statuses, setStatuses] = useState<TaskStatus[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [labels, setLabels] = useState<LabelBrief[]>([])
  const [employees, setEmployees] = useState<EmployeeBrief[]>([])
  const [canManage, setCanManage] = useState(false)
  const [viewerEmployeeId, setViewerEmployeeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState<ViewMode>('board')
  const [search, setSearch] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState('')
  const [labelId, setLabelId] = useState('')
  const [includeDone, setIncludeDone] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [showStatusManager, setShowStatusManager] = useState(false)
  // Full create form (title, due date, assignees, notes, attachments). The
  // inline quick-add below stays for typing a title straight into a column.
  const [showCreate, setShowCreate] = useState<{ statusId: string | null } | null>(null)
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  // Deep links from notifications arrive as ?task=<id>.
  useEffect(() => {
    const t = searchParams.get('task')
    if (t) setOpenTaskId(t)
  }, [searchParams])

  // `?assignee=me` is what the old My Work page became — it now just
  // preselects this viewer in the assignee filter. Resolved once the first
  // load returns, since the viewer's employee id arrives with the data.
  useEffect(() => {
    if (searchParams.get('assignee') === 'me' && viewerEmployeeId) {
      setAssignee(viewerEmployeeId)
    }
  }, [searchParams, viewerEmployeeId])

  const loadTasks = useCallback(async () => {
    const params = new URLSearchParams()
    if (!includeDone) params.set('includeDone', '0')
    const res = await fetch(`/api/tasks?${params.toString()}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? 'Could not load tasks')
    }
    const data = await res.json()
    setStatuses(data.statuses ?? [])
    setTasks(data.tasks ?? [])
    setCanManage(Boolean(data.canManage))
    setViewerEmployeeId(data.viewerEmployeeId ?? null)
  }, [includeDone])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadTasks(),
        fetch('/api/task-labels').then(r => (r.ok ? r.json() : null)).then(d => setLabels(d?.labels ?? [])),
        fetch('/api/employees?limit=500').then(r => (r.ok ? r.json() : null)).then(d => setEmployees(d?.employees ?? [])),
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load tasks')
    } finally {
      setLoading(false)
    }
  }, [loadTasks])

  useEffect(() => { void loadAll() }, [loadAll])

  // Filtering is client-side so typing stays responsive; the fetch already
  // scoped the rows to the company.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter(t => {
      if (q && !t.title.toLowerCase().includes(q) && !t.key.toLowerCase().includes(q)) return false
      if (assignee && !t.assignees.some(a => a.id === assignee)) return false
      if (priority && t.priority !== priority) return false
      if (labelId && !t.labels.some(l => l.id === labelId)) return false
      return true
    })
  }, [tasks, search, assignee, priority, labelId])

  const quickCreate = async (statusId: string) => {
    const title = newTitle.trim()
    if (!title) return
    setCreating(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, statusId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Could not create the task')
      }
      setNewTitle('')
      setCreatingIn(null)
      await loadTasks()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the task')
    } finally {
      setCreating(false)
    }
  }

  const openCount = filtered.filter(t => t.status.category !== 'DONE' && !t.parentTaskId).length
  const activeFilterCount = [assignee, priority, labelId, includeDone ? '' : 'hide-done'].filter(Boolean).length
  const clearFilters = () => {
    setAssignee('')
    setPriority('')
    setLabelId('')
    setIncludeDone(true)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="All Tasks"
        icon={<CheckCircle2 className="h-5 w-5" />}
        subtitle={loading ? 'Loading…' : `${openCount} open · ${filtered.length} shown`}
        actions={
          <div className="flex items-center gap-2">
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                data-tour="task-statuses"
                onClick={() => setShowStatusManager(true)}
              >
                <Settings2 /> Statuses & labels
              </Button>
            )}
            <Button
              size="sm"
              data-tour="task-new"
              onClick={() => setShowCreate({ statusId: statuses[0]?.id ?? null })}
              disabled={statuses.length === 0}
            >
              <Plus /> New task
            </Button>
          </div>
        }
      />

      {/* View switcher + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-lg border border-border p-0.5">
          {VIEWS.map(v => (
            <button
              key={v.id}
              type="button"
              data-tour-view={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                view === v.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <v.icon className="h-3.5 w-3.5" />
              {v.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-44 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter tasks…"
            className="h-8 pl-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          variant={activeFilterCount ? 'default' : 'outline'}
          className="sm:hidden"
          onClick={() => setShowFilters(value => !value)}
        >
          <SlidersHorizontal /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </Button>

        <div className={cn('w-full flex-wrap items-center gap-2 sm:flex sm:w-auto', showFilters ? 'flex' : 'hidden')}>
        <select
          value={assignee}
          data-tour="task-assignee-filter"
          onChange={e => setAssignee(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="">All assignees</option>
          {viewerEmployeeId && <option value={viewerEmployeeId}>Assigned to me</option>}
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
          ))}
        </select>

        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="">Any priority</option>
          {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {labels.length > 0 && (
          <select
            value={labelId}
            onChange={e => setLabelId(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="">Any label</option>
            {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}

        <Button size="sm" variant={includeDone ? 'default' : 'outline'} onClick={() => setIncludeDone(v => !v)}>
          <CheckCircle2 /> Done
        </Button>
        {activeFilterCount > 0 && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <RotateCcw /> Clear
          </Button>
        )}
        </div>
      </div>

      {/* Quick-add row */}
      {creatingIn && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
          <Input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); void quickCreate(creatingIn) }
              if (e.key === 'Escape') setCreatingIn(null)
            }}
            placeholder="Task title…"
            className="h-8 flex-1 text-sm"
          />
          <select
            value={creatingIn}
            onChange={e => setCreatingIn(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button size="sm" onClick={() => void quickCreate(creatingIn)} disabled={creating}>
            {creating && <Loader2 className="animate-spin" />} Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setShowCreate({ statusId: creatingIn }); setCreatingIn(null) }}
            title="Open the full form to add a due date, assignees, notes or files"
          >
            More options
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCreatingIn(null)}>Cancel</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><AppSpinner /></div>
      ) : statuses.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No task statuses configured yet.
        </CardContent></Card>
      ) : (
        <>
          {view === 'board' && (
            <TaskBoard
              statuses={statuses}
              tasks={filtered}
              canEdit
              onOpenTask={setOpenTaskId}
              onQuickAdd={statusId => { setCreatingIn(statusId); setNewTitle('') }}
              onTasksChange={setTasks}
              onRefetch={loadTasks}
            />
          )}
          {view === 'list' && (
            <TaskListView statuses={statuses} tasks={filtered} onOpenTask={setOpenTaskId} />
          )}
          {view === 'table' && (
            <TaskTableView statuses={statuses} tasks={filtered} onOpenTask={setOpenTaskId} />
          )}
          {view === 'calendar' && (
            <TaskCalendarView tasks={filtered} onOpenTask={setOpenTaskId} />
          )}
        </>
      )}

      {openTaskId && (
        <TaskDetailDrawer
          taskId={openTaskId}
          statuses={statuses}
          labels={labels}
          assignableEmployees={employees}
          onClose={() => {
            setOpenTaskId(null)
            if (searchParams.get('task')) router.replace('/tasks')
          }}
          onChanged={() => { void loadTasks() }}
        />
      )}

      {showCreate && (
        <CreateTaskDialog
          statuses={statuses}
          employees={employees}
          defaultStatusId={showCreate.statusId}
          onClose={() => setShowCreate(null)}
          onCreated={() => { setShowCreate(null); void loadTasks() }}
        />
      )}

      {showStatusManager && (
        <StatusManagerDialog
          statuses={statuses}
          labels={labels}
          onClose={() => setShowStatusManager(false)}
          onChanged={() => { void loadAll() }}
        />
      )}
    </div>
  )
}

/** Compact grouped rows — denser than the board, richer than the table. */
function TaskListView({
  statuses, tasks, onOpenTask,
}: { statuses: TaskStatus[]; tasks: TaskRow[]; onOpenTask: (id: string) => void }) {
  const top = tasks.filter(t => !t.parentTaskId)
  if (top.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-12 text-center">
        <p className="text-sm text-muted-foreground">No tasks match these filters.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {statuses.map(status => {
        const rows = top.filter(t => t.statusId === status.id).sort((a, b) => a.order - b.order)
        if (rows.length === 0) return null
        return (
          <section key={status.id}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color }} />
              <h3 className="text-base font-semibold text-foreground">{status.name}</h3>
              <span className="text-sm text-muted-foreground">{rows.length}</span>
            </div>
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {rows.map(t => {
                const overdue = isOverdue(t.dueDate, t.completedAt)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpenTask(t.id)}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 bg-card px-3 py-3 text-left transition hover:bg-muted/40 sm:grid-cols-[auto_minmax(12rem,1fr)_auto]"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">{t.key}</span>
                    <span className={cn('min-w-0 flex-1 truncate text-base font-medium', t.completedAt && 'text-muted-foreground line-through')}>
                      {t.title}
                    </span>
                    <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
                      {t.labels.map(l => (
                        <span key={l.id} className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `${l.color}22`, color: l.color }}>
                          {l.name}
                        </span>
                      ))}
                      <Badge variant="outline" className={cn('border text-[11px]', PRIORITY_STYLES[t.priority])}>{t.priority}</Badge>
                      {t.dueDate && (
                        <span className={cn('inline-flex items-center gap-0.5 text-xs', overdue ? 'font-semibold text-red-600' : 'text-muted-foreground')}>
                          <Clock className="h-3 w-3" />{formatDueDate(t.dueDate)}
                        </span>
                      )}
                      <AvatarStack employees={t.assignees} max={3} size="xs" />
                    </div>
                    {t.checklistTotal > 0 && (
                      <div className="col-span-2 flex items-center gap-2 sm:col-start-2 sm:col-end-4" aria-label={`${t.checklistDone} of ${t.checklistTotal} checklist items completed`}>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((t.checklistDone / t.checklistTotal) * 100)}%` }} />
                        </div>
                        <span className="text-[11px] font-semibold text-muted-foreground">{Math.round((t.checklistDone / t.checklistTotal) * 100)}%</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Month grid keyed on due date. */
function TaskCalendarView({
  tasks, onOpenTask,
}: { tasks: TaskRow[]; onOpenTask: (id: string) => void }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const { label, cells } = useMemo(() => {
    const now = new Date()
    const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const year = base.getFullYear()
    const month = base.getMonth()

    const first = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const leading = first.getDay()

    const byDay = new Map<string, TaskRow[]>()
    for (const t of tasks) {
      if (!t.dueDate) continue
      const key = t.dueDate.slice(0, 10)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(t)
    }

    const out: Array<{ date: string | null; day: number | null; tasks: TaskRow[] }> = []
    for (let i = 0; i < leading; i++) out.push({ date: null, day: null, tasks: [] })
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      out.push({ date: key, day: d, tasks: byDay.get(key) ?? [] })
    }

    return {
      label: base.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
      cells: out,
    }
  }, [tasks, monthOffset])

  // Lazy state initialiser: runs exactly once when the view mounts, which
  // keeps Date.now() out of the render path. React flags impure calls during
  // render (including inside useMemo), and a setState-in-effect version trips
  // the cascading-render rule — this is the one form that satisfies both.
  const [todayKey] = useState(() =>
    new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10),
  )

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold">{label}</h3>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setMonthOffset(o => o - 1)}>Prev</Button>
          <Button size="sm" variant="outline" onClick={() => setMonthOffset(0)}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => setMonthOffset(o => o + 1)}>Next</Button>
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {cells.filter(cell => cell.day && cell.tasks.length > 0).map(cell => (
          <section key={cell.date} className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-semibold">
              {new Date(`${cell.date}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
            </header>
            <div className="divide-y divide-border">
              {cell.tasks.map(task => (
                <button key={task.id} type="button" onClick={() => onOpenTask(task.id)} className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-muted/40">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: task.status.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{task.title}</span>
                  <Badge variant="outline" className={cn('text-[10px]', PRIORITY_STYLES[task.priority])}>{task.priority}</Badge>
                </button>
              ))}
            </div>
          </section>
        ))}
        {cells.every(cell => cell.tasks.length === 0) && (
          <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No tasks due this month.
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 gap-px rounded-t-lg bg-border text-center text-xs font-medium text-muted-foreground">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="bg-muted/60 py-1.5">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px rounded-b-lg bg-border">
            {cells.map((cell, i) => (
              <div
                key={i}
                className={cn(
                  'min-h-24 bg-card p-1',
                  cell.date === todayKey && 'ring-1 ring-inset ring-primary',
                  !cell.day && 'bg-muted/30',
                )}
              >
                {cell.day && (
                  <span className={cn(
                    'text-xs',
                    cell.date === todayKey ? 'font-bold text-primary' : 'text-muted-foreground',
                  )}>
                    {cell.day}
                  </span>
                )}
                <div className="mt-0.5 space-y-0.5">
                  {cell.tasks.slice(0, expandedDate === cell.date ? cell.tasks.length : 3).map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpenTask(t.id)}
                      className="block w-full truncate rounded border-l-2 px-1.5 py-0.5 text-left text-[11px] font-medium text-foreground hover:bg-muted"
                      style={{ backgroundColor: `${t.status.color}18`, borderLeftColor: t.status.color }}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                  ))}
                  {cell.tasks.length > 3 && expandedDate !== cell.date && (
                    <button type="button" onClick={() => setExpandedDate(cell.date)} className="block w-full px-1 text-left text-[11px] font-medium text-primary hover:underline">
                      +{cell.tasks.length - 3} more
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
