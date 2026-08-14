'use client'

/**
 * Slide-over panel for a single task: description, assignees, labels, dates,
 * checklist, time logs, comments and the activity trail.
 *
 * Field edits save on blur/change rather than behind a Save button, matching
 * how Trello/Monday behave — the drawer is a live view of the record.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  X, Trash2, Plus, Clock, MessageSquare, CheckSquare, Loader2, History,
  Paperclip, Upload, FileText, Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { toast } from 'sonner'
import { EmployeeAvatar } from './Avatars'
import { MentionComposer, CommentBody } from './MentionComposer'
import {
  PRIORITY_STYLES, fullName, toDateInput, initialsOf, avatarTint,
  type EmployeeBrief, type LabelBrief, type Priority, type TaskStatus,
} from './types'

interface TaskDetail {
  id: string
  number: number
  title: string
  description: string | null
  statusId: string
  priority: Priority
  startDate: string | null
  dueDate: string | null
  estimateHours: number | null
  loggedHours: number
  completedAt: string | null
  key: string
  status: { id: string; name: string; color: string; category: string }
  parent: { id: string; number: number; title: string } | null
  assignees: EmployeeBrief[]
  labels: LabelBrief[]
  checklist: Array<{ id: string; text: string; isDone: boolean; order: number }>
  comments: Array<{ id: string; body: string; createdAt: string; authorName: string }>
  attachments: Array<{
    id: string; fileName: string; fileUrl: string; fileSize: number
    mimeType: string; createdAt: string; uploadedByName: string
    uploadedByUserId: string
  }>
  activity: Array<{ id: string; action: string; createdAt: string; actorName: string; meta: unknown }>
  timeLogs: Array<{
    id: string; date: string; hours: number; note: string | null
    employee: EmployeeBrief
  }>
}

interface Props {
  taskId: string
  statuses: TaskStatus[]
  labels: LabelBrief[]
  /** Employees who can be assigned — the company roster. */
  assignableEmployees: EmployeeBrief[]
  onClose: () => void
  /** Called after any mutation so the parent board can refresh. */
  onChanged: () => void
}

export function TaskDetailDrawer({
  taskId, statuses, labels: allLabels, assignableEmployees, onClose, onChanged,
}: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [viewerEmployeeId, setViewerEmployeeId] = useState<string | null>(null)
  const [viewerUserId, setViewerUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [checklistDraft, setChecklistDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  const [logHours, setLogHours] = useState('')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [logNote, setLogNote] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`)
      if (!res.ok) throw new Error('Could not load the task')
      const data = await res.json()
      setTask(data.task)
      setCanEdit(Boolean(data.access?.canEdit))
      setCanManage(Boolean(data.access?.canManage))
      setViewerEmployeeId(data.viewerEmployeeId ?? null)
      setViewerUserId(data.viewerUserId ?? null)
      setTitleDraft(data.task.title)
      setDescDraft(data.task.description ?? '')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the task')
      onClose()
    } finally {
      setLoading(false)
    }
  }, [taskId, onClose])

  useEffect(() => { void load() }, [load])

  // Escape closes the drawer, matching the dialog primitives used elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true)
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? 'Update failed')
        }
        await load()
        onChanged()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Update failed')
      } finally {
        setSaving(false)
      }
    },
    [taskId, load, onChanged],
  )

  const addComment = async (body: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Could not post the comment')
      }
      await load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not post the comment')
      // Rethrow so the composer keeps the draft instead of clearing it.
      throw err
    }
  }

  const uploadAttachment = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Upload failed')
      }
      await load()
      onChanged()
      toast.success('File attached')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments?attachmentId=${attachmentId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Could not remove the file')
      }
      await load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the file')
    }
  }

  const addChecklistItem = async () => {
    const text = checklistDraft.trim()
    if (!text) return
    setChecklistDraft('')
    try {
      const res = await fetch(`/api/tasks/${taskId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error('Could not add the item')
      await load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the item')
    }
  }

  const toggleChecklist = async (itemId: string, isDone: boolean) => {
    await fetch(`/api/tasks/${taskId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, isDone }),
    })
    await load()
    onChanged()
  }

  const removeChecklist = async (itemId: string) => {
    await fetch(`/api/tasks/${taskId}/checklist?itemId=${itemId}`, { method: 'DELETE' })
    await load()
    onChanged()
  }

  const logTime = async () => {
    const hours = Number(logHours)
    if (!Number.isFinite(hours) || hours <= 0) {
      toast.error('Enter the hours worked')
      return
    }
    try {
      const res = await fetch(`/api/tasks/${taskId}/time-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours, date: logDate, note: logNote || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Could not log time')
      }
      setLogHours('')
      setLogNote('')
      await load()
      onChanged()
      toast.success('Time logged')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not log time')
    }
  }

  const deleteTask = async () => {
    if (!confirm('Delete this task? Its comments, checklist and time logs go with it.')) return
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Could not delete the task')
      toast.success('Task deleted')
      onChanged()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the task')
    }
  }

  const toggleAssignee = (employeeId: string) => {
    if (!task) return
    const has = task.assignees.some(a => a.id === employeeId)
    const next = has
      ? task.assignees.filter(a => a.id !== employeeId).map(a => a.id)
      : [...task.assignees.map(a => a.id), employeeId]
    void patch({ assigneeEmployeeIds: next })
  }

  const toggleLabel = (labelId: string) => {
    if (!task) return
    const has = task.labels.some(l => l.id === labelId)
    const next = has
      ? task.labels.filter(l => l.id !== labelId).map(l => l.id)
      : [...task.labels.map(l => l.id), labelId]
    void patch({ labelIds: next })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-background shadow-2xl"
        role="dialog"
        aria-label="Task details"
      >
        {loading || !task ? (
          <div className="flex flex-1 items-center justify-center">
            <AppSpinner />
          </div>
        ) : (
          <>
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">
                  {task.key}
                  {task.parent && (
                    <span className="ml-2">· subtask of TSK-{task.parent.number}</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{task.status.name}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {canEdit && (
                  <Button variant="ghost" size="icon-sm" onClick={deleteTask} aria-label="Delete task">
                    <Trash2 className="text-destructive" />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
                  <X />
                </Button>
              </div>
            </header>

            <div className="flex-1 space-y-5 px-4 py-4">
              {/* Title */}
              <input
                value={titleDraft}
                disabled={!canEdit}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={() => {
                  if (titleDraft.trim() && titleDraft !== task.title) void patch({ title: titleDraft.trim() })
                }}
                className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-foreground outline-none hover:border-border focus:border-primary disabled:cursor-default"
              />

              {/* Status / priority / dates */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <select
                    value={task.statusId}
                    disabled={!canEdit}
                    onChange={e => void patch({ statusId: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    {statuses.map(st => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Priority">
                  <select
                    value={task.priority}
                    disabled={!canEdit}
                    onChange={e => void patch({ priority: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Start date">
                  <Input
                    type="date"
                    disabled={!canEdit}
                    defaultValue={toDateInput(task.startDate)}
                    onChange={e => void patch({ startDate: e.target.value || null })}
                  />
                </Field>

                <Field label="Due date">
                  <Input
                    type="date"
                    disabled={!canEdit}
                    defaultValue={toDateInput(task.dueDate)}
                    onChange={e => void patch({ dueDate: e.target.value || null })}
                  />
                </Field>

                <Field label="Estimate (hours)">
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    disabled={!canEdit}
                    defaultValue={task.estimateHours ?? ''}
                    onBlur={e => {
                      const v = e.target.value
                      void patch({ estimateHours: v === '' ? null : Number(v) })
                    }}
                  />
                </Field>

                <Field label="Logged">
                  <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{task.loggedHours}h</span>
                    {task.estimateHours ? (
                      <span
                        className={cn(
                          'text-xs',
                          task.loggedHours > task.estimateHours ? 'text-red-600' : 'text-muted-foreground',
                        )}
                      >
                        / {task.estimateHours}h
                      </span>
                    ) : null}
                  </div>
                </Field>
              </div>

              {/* Assignees */}
              <Section title="Assignees">
                <div className="flex flex-wrap gap-1.5">
                  {assignableEmployees.map(employee => {
                    const active = task.assignees.some(a => a.id === employee.id)
                    return (
                      <button
                        key={employee.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggleAssignee(employee.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition',
                          active
                            ? 'border-primary bg-primary/10 font-medium text-foreground'
                            : 'border-border text-muted-foreground hover:border-primary/40',
                          !canEdit && 'cursor-default opacity-70',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold',
                            avatarTint(employee.id),
                          )}
                        >
                          {initialsOf(employee)}
                        </span>
                        {fullName(employee)}
                      </button>
                    )
                  })}
                  {assignableEmployees.length === 0 && (
                    <p className="text-xs text-muted-foreground">No employees available.</p>
                  )}
                </div>
              </Section>

              {/* Labels */}
              {allLabels.length > 0 && (
                <Section title="Labels">
                  <div className="flex flex-wrap gap-1.5">
                    {allLabels.map(l => {
                      const active = task.labels.some(x => x.id === l.id)
                      return (
                        <button
                          key={l.id}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => toggleLabel(l.id)}
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium transition',
                            active ? 'ring-2 ring-offset-1' : 'opacity-50 hover:opacity-100',
                          )}
                          style={{
                            backgroundColor: `${l.color}22`,
                            color: l.color,
                            ...(active ? { boxShadow: `0 0 0 2px ${l.color}` } : {}),
                          }}
                        >
                          {l.name}
                        </button>
                      )
                    })}
                  </div>
                </Section>
              )}

              {/* Description */}
              <Section title="Description">
                <Textarea
                  rows={4}
                  disabled={!canEdit}
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  onBlur={() => {
                    if (descDraft !== (task.description ?? '')) {
                      void patch({ description: descDraft || null })
                    }
                  }}
                  placeholder="Add more detail…"
                />
              </Section>

              {/* Checklist */}
              <Section title="Checklist" icon={<CheckSquare className="h-3.5 w-3.5" />}>
                <div className="space-y-1.5">
                  {task.checklist.length > 0 && (() => {
                    const done = task.checklist.filter(item => item.isDone).length
                    const percent = Math.round((done / task.checklist.length) * 100)
                    return (
                      <div className="mb-3 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{percent}%</span>
                      </div>
                    )
                  })()}
                  {task.checklist.map(item => (
                    <div key={item.id} className="group flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.isDone}
                        disabled={!canEdit}
                        onChange={e => void toggleChecklist(item.id, e.target.checked)}
                        className="h-4 w-4 rounded border-border"
                      />
                      <span className={cn('flex-1 text-sm', item.isDone && 'text-muted-foreground line-through')}>
                        {item.text}
                      </span>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-0 group-hover:opacity-100"
                          onClick={() => void removeChecklist(item.id)}
                          aria-label="Remove item"
                        >
                          <X />
                        </Button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <div className="flex gap-1.5">
                      <Input
                        value={checklistDraft}
                        onChange={e => setChecklistDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addChecklistItem() } }}
                        placeholder="Add a checklist item…"
                        className="h-8 text-sm"
                      />
                      <Button size="sm" variant="outline" onClick={() => void addChecklistItem()}>
                        <Plus />
                      </Button>
                    </div>
                  )}
                </div>
              </Section>

              {/* Attachments */}
              <Section title="Attachments" icon={<Paperclip className="h-3.5 w-3.5" />}>
                {task.attachments.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {task.attachments.map(a => (
                      <li
                        key={a.id}
                        className="group flex items-center gap-2 rounded-md border border-border p-1.5"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{a.fileName}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {formatBytes(a.fileSize)} · {a.uploadedByName}
                          </span>
                        </span>
                        <a
                          href={a.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Download ${a.fileName}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        {canEdit && (a.uploadedByUserId === viewerUserId || canManage) && (
                          <button
                            type="button"
                            onClick={() => void removeAttachment(a.id)}
                            className="shrink-0 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                            aria-label={`Remove ${a.fileName}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && (
                  <label
                    className={cn(
                      'flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground',
                      uploading && 'pointer-events-none opacity-60',
                    )}
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploading ? 'Uploading…' : 'Attach a file (max 20 MB)'}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploading}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        // Reset so re-picking the same file still fires onChange.
                        e.target.value = ''
                        if (file) void uploadAttachment(file)
                      }}
                    />
                  </label>
                )}
              </Section>

              {/* Time logs */}
              <Section title="Time log" icon={<Clock className="h-3.5 w-3.5" />}>
                {task.timeLogs.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {task.timeLogs.map(l => (
                      <li key={l.id} className="flex items-center gap-2 text-xs">
                        <EmployeeAvatar employee={l.employee} size="xs" />
                        <span className="font-medium">{l.hours}h</span>
                        <span className="text-muted-foreground">{l.date.slice(0, 10)}</span>
                        {l.note && <span className="truncate text-muted-foreground">— {l.note}</span>}
                        {(canEdit && l.employee.id === viewerEmployeeId) && (
                          <button
                            type="button"
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              await fetch(`/api/tasks/${taskId}/time-logs?logId=${l.id}`, { method: 'DELETE' })
                              await load()
                              onChanged()
                            }}
                            aria-label="Remove time entry"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && (
                  <div className="flex flex-wrap items-end gap-1.5">
                    <Input
                      type="number" min="0" step="0.25" placeholder="Hours"
                      value={logHours} onChange={e => setLogHours(e.target.value)}
                      className="h-8 w-24 text-sm"
                    />
                    <Input
                      type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
                      className="h-8 w-36 text-sm"
                    />
                    <Input
                      placeholder="Note (optional)" value={logNote}
                      onChange={e => setLogNote(e.target.value)}
                      className="h-8 flex-1 text-sm"
                    />
                    <Button size="sm" variant="outline" onClick={() => void logTime()}>Log</Button>
                  </div>
                )}
              </Section>

              {/* Comments */}
              <Section title="Comments" icon={<MessageSquare className="h-3.5 w-3.5" />}>
                <div className="space-y-2">
                  {task.comments.map(c => (
                    <div key={c.id} className="rounded-md bg-muted/40 p-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">{c.authorName}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString('en-PH')}
                        </span>
                      </div>
                      <div className="mt-0.5">
                        <CommentBody body={c.body} />
                      </div>
                    </div>
                  ))}
                  {task.comments.length === 0 && (
                    <p className="text-xs text-muted-foreground">No comments yet.</p>
                  )}
                  {canEdit && <MentionComposer onSubmit={addComment} />}
                </div>
              </Section>

              {/* Activity */}
              <Section title="Activity" icon={<History className="h-3.5 w-3.5" />}>
                <ul className="space-y-1">
                  {task.activity.map(a => (
                    <li key={a.id} className="flex items-baseline gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{a.actorName}</span>
                      <span>{a.action.replace(/_/g, ' ')}</span>
                      <span className="ml-auto shrink-0 text-[10px]">
                        {new Date(a.createdAt).toLocaleDateString('en-PH')}
                      </span>
                    </li>
                  ))}
                  {task.activity.length === 0 && <li className="text-xs text-muted-foreground">No activity yet.</li>}
                </ul>
              </Section>

              <div className="pt-2">
                <Badge variant="outline" className={cn('border', PRIORITY_STYLES[task.priority])}>
                  {task.status.name}
                </Badge>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Section({
  title, icon, children,
}: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  )
}
