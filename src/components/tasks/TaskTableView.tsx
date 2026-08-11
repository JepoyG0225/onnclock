'use client'

/**
 * Spreadsheet-style task view — the "Table"/"List" mode from Monday and
 * ClickUp. Groups by board column, and every row opens the same drawer the
 * board uses so the two views stay consistent.
 */

import { useMemo } from 'react'
import { Clock, MessageSquare, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { AvatarStack } from './Avatars'
import {
  PRIORITY_STYLES, formatDueDate, isOverdue,
  type TaskStatus, type TaskRow,
} from './types'

export function TaskTableView({
  statuses,
  tasks,
  onOpenTask,
}: {
  statuses: TaskStatus[]
  tasks: TaskRow[]
  onOpenTask: (id: string) => void
}) {
  const grouped = useMemo(() => {
    return statuses.map(st => ({
      column: st,
      rows: tasks
        .filter(t => t.statusId === st.id && !t.parentTaskId)
        .sort((a, b) => a.order - b.order),
    }))
  }, [statuses, tasks])

  const total = tasks.filter(t => !t.parentTaskId).length
  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-12 text-center">
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {grouped.map(({ column, rows }) => {
        if (rows.length === 0) return null
        return (
          <section key={column.id}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: column.color }} />
              <h3 className="text-sm font-semibold text-foreground">{column.name}</h3>
              <span className="text-xs text-muted-foreground">{rows.length}</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Task</th>
                    <th className="px-3 py-2 font-medium">Assignees</th>
                    <th className="px-3 py-2 font-medium">Priority</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 text-right font-medium">Est / Logged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(t => {
                    const overdue = isOverdue(t.dueDate, t.completedAt)
                    return (
                      <tr
                        key={t.id}
                        onClick={() => onOpenTask(t.id)}
                        className="cursor-pointer bg-card transition hover:bg-muted/40"
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {t.key}
                            </span>
                            <span className={cn('font-medium', t.completedAt && 'text-muted-foreground line-through')}>
                              {t.title}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {t.labels.map(l => (
                              <span
                                key={l.id}
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                                style={{ backgroundColor: `${l.color}22`, color: l.color }}
                              >
                                {l.name}
                              </span>
                            ))}
                            {t.commentCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <MessageSquare className="h-3 w-3" />{t.commentCount}
                              </span>
                            )}
                            {t.checklistTotal > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <CheckSquare className="h-3 w-3" />{t.checklistDone}/{t.checklistTotal}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <AvatarStack employees={t.assignees} max={3} size="xs" />
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={cn('border text-[10px]', PRIORITY_STYLES[t.priority])}>
                            {t.priority}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {t.dueDate ? (
                            <span className={cn('inline-flex items-center gap-1 text-xs', overdue ? 'font-semibold text-red-600' : 'text-muted-foreground')}>
                              <Clock className="h-3 w-3" />
                              {formatDueDate(t.dueDate)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          <span className="text-muted-foreground">{t.estimateHours ?? '—'}</span>
                          <span className="mx-1 text-muted-foreground">/</span>
                          <span className={cn(
                            'font-medium',
                            t.estimateHours && t.loggedHours > t.estimateHours ? 'text-red-600' : 'text-foreground',
                          )}>
                            {t.loggedHours}h
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
