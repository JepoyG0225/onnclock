'use client'

/**
 * Kanban board, grouped by company task status.
 *
 * Drag-and-drop uses the native HTML5 API rather than a library — the board
 * only needs card-into-status moves, and the app ships no DnD dependency.
 *
 * Ordering: on drop we work out the card above and below the pointer and send
 * those neighbour ids to /api/tasks/move, which places the task by midpoint.
 * The move is applied optimistically and rolled back if the request fails.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { Plus, MessageSquare, CheckSquare, Clock, GripVertical, AlertTriangle, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AvatarStack } from './Avatars'
import { PRIORITY_STYLES, formatDueDate, isOverdue, type TaskStatus, type TaskRow } from './types'

interface Props {
  statuses: TaskStatus[]
  tasks: TaskRow[]
  canEdit: boolean
  onOpenTask: (taskId: string) => void
  onQuickAdd: (statusId: string) => void
  onTasksChange: (next: TaskRow[]) => void
  /** Reloads from the server when optimistic state can't be trusted. */
  onRefetch: () => void | Promise<void>
}

interface DropTarget {
  statusId: string
  index: number
}

export function TaskBoard({
  statuses, tasks, canEdit, onOpenTask, onQuickAdd, onTasksChange, onRefetch,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  /** Pre-drag snapshot, so a failed move can be rolled back. */
  const snapshot = useRef<TaskRow[] | null>(null)

  // Only top-level tasks appear on the board; subtasks live inside their parent.
  const byStatus = useMemo(() => {
    const map = new Map<string, TaskRow[]>()
    for (const st of statuses) map.set(st.id, [])
    for (const t of tasks) {
      if (t.parentTaskId) continue
      map.get(t.statusId)?.push(t)
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order)
    return map
  }, [statuses, tasks])

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    if (!canEdit) return
    snapshot.current = tasks
    setDraggingId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox refuses to start a drag without payload on the transfer.
    e.dataTransfer.setData('text/plain', taskId)
  }, [canEdit, tasks])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    setDropTarget(null)
  }, [])

  const commitMove = useCallback(async (taskId: string, statusId: string, index: number) => {
    const list = (byStatus.get(statusId) ?? []).filter(t => t.id !== taskId)
    const afterTaskId = index > 0 ? list[index - 1]?.id ?? null : null
    const beforeTaskId = list[index]?.id ?? null

    // Optimistic placement so the card doesn't snap back while we wait.
    const afterOrder = afterTaskId ? tasks.find(t => t.id === afterTaskId)?.order : undefined
    const beforeOrder = beforeTaskId ? tasks.find(t => t.id === beforeTaskId)?.order : undefined
    let optimisticOrder: number
    if (afterOrder !== undefined && beforeOrder !== undefined) optimisticOrder = (afterOrder + beforeOrder) / 2
    else if (afterOrder !== undefined) optimisticOrder = afterOrder + 1
    else if (beforeOrder !== undefined) optimisticOrder = beforeOrder - 1
    else optimisticOrder = 0

    onTasksChange(tasks.map(t => (t.id === taskId ? { ...t, statusId, order: optimisticOrder } : t)))

    try {
      const res = await fetch('/api/tasks/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, statusId, afterTaskId, beforeTaskId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Move failed')
      }
      const data = await res.json()
      // The server renormalises the whole status when float precision runs
      // out, rewriting orders we don't have — refetch rather than guess.
      if (data.renormalised) {
        await onRefetch()
        return
      }
      if (data.task) {
        onTasksChange(
          (snapshot.current ?? tasks).map(t =>
            t.id === taskId
              ? { ...t, statusId: data.task.statusId, order: data.task.order, completedAt: data.task.completedAt }
              : t,
          ),
        )
      }
    } catch (err) {
      if (snapshot.current) onTasksChange(snapshot.current)
      toast.error(err instanceof Error ? err.message : 'Could not move the task')
    }
  }, [byStatus, tasks, onTasksChange, onRefetch])

  const handleDrop = useCallback((e: React.DragEvent, statusId: string, index: number) => {
    e.preventDefault()
    const taskId = draggingId ?? e.dataTransfer.getData('text/plain')
    setDraggingId(null)
    setDropTarget(null)
    if (!taskId || !canEdit) return
    void commitMove(taskId, statusId, index)
  }, [draggingId, canEdit, commitMove])

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {statuses.map(status => {
        const list = byStatus.get(status.id) ?? []
        const overWip = status.wipLimit !== null && list.length > status.wipLimit

        return (
          <section
            key={status.id}
            className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/40"
            onDragOver={e => {
              if (!canEdit) return
              e.preventDefault()
              if (list.length === 0) setDropTarget({ statusId: status.id, index: 0 })
            }}
            onDrop={e =>
              handleDrop(e, status.id, dropTarget?.statusId === status.id ? dropTarget.index : list.length)
            }
          >
            <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                <h3 className="truncate text-sm font-semibold text-foreground">{status.name}</h3>
                <span className="shrink-0 text-xs text-muted-foreground">{list.length}</span>
                {overWip && (
                  <span title={`WIP limit is ${status.wipLimit}`}>
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  </span>
                )}
              </div>
              {canEdit && (
                <Button
                  variant="ghost" size="icon-xs"
                  onClick={() => onQuickAdd(status.id)}
                  aria-label={`Add task to ${status.name}`}
                >
                  <Plus />
                </Button>
              )}
            </header>

            <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
              {list.map((task, index) => (
                <div key={task.id}>
                  {/* Thin hit-zone above each card marks the insert position. */}
                  <div
                    className={cn(
                      'h-1 rounded transition-colors',
                      dropTarget?.statusId === status.id && dropTarget.index === index
                        ? 'bg-primary'
                        : 'bg-transparent',
                    )}
                    onDragOver={e => {
                      if (!canEdit) return
                      e.preventDefault(); e.stopPropagation()
                      setDropTarget({ statusId: status.id, index })
                    }}
                    onDrop={e => { e.stopPropagation(); handleDrop(e, status.id, index) }}
                  />
                  <BoardCard
                    task={task}
                    canEdit={canEdit}
                    isDragging={draggingId === task.id}
                    onOpen={() => onOpenTask(task.id)}
                    onDragStart={e => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              ))}

              {/* Tail zone — drops here append to the bottom. */}
              <div
                className={cn(
                  'min-h-8 flex-1 rounded transition-colors',
                  dropTarget?.statusId === status.id && dropTarget.index === list.length
                    ? 'bg-primary/10 ring-1 ring-primary'
                    : '',
                )}
                onDragOver={e => {
                  if (!canEdit) return
                  e.preventDefault(); e.stopPropagation()
                  setDropTarget({ statusId: status.id, index: list.length })
                }}
                onDrop={e => { e.stopPropagation(); handleDrop(e, status.id, list.length) }}
              >
                {list.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {canEdit ? 'Drop a task here' : 'No tasks'}
                  </p>
                )}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function BoardCard({
  task, canEdit, isDragging, onOpen, onDragStart, onDragEnd,
}: {
  task: TaskRow
  canEdit: boolean
  isDragging: boolean
  onOpen: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  const overdue = isOverdue(task.dueDate, task.completedAt)

  return (
    <article
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'group cursor-pointer rounded-lg border border-border bg-card p-2.5 shadow-sm transition hover:border-primary/40 hover:shadow',
        isDragging && 'opacity-40',
      )}
    >
      {task.labels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {task.labels.map(l => (
            <span
              key={l.id}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start gap-1.5">
        {canEdit && (
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition group-hover:opacity-100" />
        )}
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">{task.title}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">{task.key}</span>
        <Badge variant="outline" className={cn('h-4 border px-1 text-[10px]', PRIORITY_STYLES[task.priority])}>
          {task.priority}
        </Badge>
        {task.dueDate && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[10px]',
              overdue ? 'font-semibold text-red-600' : 'text-muted-foreground',
            )}
          >
            <Clock className="h-3 w-3" />
            {formatDueDate(task.dueDate)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" />{task.commentCount}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip className="h-3 w-3" />{task.attachmentCount}
            </span>
          )}
          {task.checklistTotal > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <CheckSquare className="h-3 w-3" />{task.checklistDone}/{task.checklistTotal}
            </span>
          )}
          {task.loggedHours > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Hours logged">
              <Clock className="h-3 w-3" />{task.loggedHours}h
            </span>
          )}
        </div>
        <AvatarStack employees={task.assignees} max={3} size="xs" />
      </div>
      {task.checklistTotal > 0 && (
        <div className="mt-2 flex items-center gap-2" aria-label={`${task.checklistDone} of ${task.checklistTotal} checklist items completed`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round((task.checklistDone / task.checklistTotal) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
            {Math.round((task.checklistDone / task.checklistTotal) * 100)}%
          </span>
        </div>
      )}
    </article>
  )
}
