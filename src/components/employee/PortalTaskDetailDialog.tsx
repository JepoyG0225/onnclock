'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays, CheckSquare, Download, FileText, Loader2, MessageSquare,
  Paperclip, Upload, UserRound, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { MentionComposer, CommentBody } from '@/components/tasks/MentionComposer'

interface PortalTaskDetail {
  id: string
  key: string
  title: string
  description: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  dueDate: string | null
  status: { name: string; color: string; category: 'TODO' | 'IN_PROGRESS' | 'DONE' }
  assignees: Array<{ id: string; firstName: string; lastName: string }>
  labels: Array<{ id: string; name: string; color: string }>
  checklist: Array<{ id: string; text: string; isDone: boolean }>
  comments: Array<{ id: string; body: string; createdAt: string; authorName: string }>
  attachments: Array<{
    id: string
    fileName: string
    fileUrl: string
    fileSize: number
    uploadedByName: string
    uploadedByUserId: string
  }>
}

export function PortalTaskDetailDialog({
  taskId,
  statuses,
  onClose,
  onChanged,
}: {
  taskId: string
  statuses: Array<{ id: string; name: string; color: string; category: 'TODO' | 'IN_PROGRESS' | 'DONE'; isDefault: boolean }>
  onClose: () => void
  onChanged: () => void
}) {
  const [task, setTask] = useState<PortalTaskDetail | null>(null)
  const [viewerUserId, setViewerUserId] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [savingChecklistIds, setSavingChecklistIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not load task details')
      setTask(data.task)
      setViewerUserId(data.viewerUserId ?? null)
      setCanEdit(Boolean(data.access?.canEdit))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load task details')
      onClose()
    } finally {
      setLoading(false)
    }
  }, [taskId, onClose])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function addComment(body: string) {
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || 'Could not add note')
    await load()
    onChanged()
  }

  async function uploadAttachment(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: form })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not attach file')
      await load()
      onChanged()
      toast.success('File attached')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not attach file')
    } finally {
      setUploading(false)
    }
  }

  async function removeAttachment(attachmentId: string) {
    const res = await fetch(`/api/tasks/${taskId}/attachments?attachmentId=${attachmentId}`, {
      method: 'DELETE',
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      toast.error(data?.error || 'Could not remove file')
      return
    }
    await load()
    onChanged()
  }

  async function toggleChecklist(itemId: string, isDone: boolean) {
    // Reflect the tick and progress immediately; the request persists it in
    // the background. Only this item rolls back if the server rejects it.
    setTask(current => current ? {
      ...current,
      checklist: current.checklist.map(item => item.id === itemId ? { ...item, isDone } : item),
    } : current)
    setSavingChecklistIds(current => new Set(current).add(itemId))

    try {
      const res = await fetch(`/api/tasks/${taskId}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, isDone }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not update checklist')
      onChanged()
    } catch (err) {
      setTask(current => current ? {
        ...current,
        checklist: current.checklist.map(item => item.id === itemId ? { ...item, isDone: !isDone } : item),
      } : current)
      toast.error(err instanceof Error ? err.message : 'Could not update checklist')
    } finally {
      setSavingChecklistIds(current => {
        const next = new Set(current)
        next.delete(itemId)
        return next
      })
    }
  }

  async function updateStatus(statusId: string) {
    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not update task status')
      await load()
      onChanged()
      toast.success('Task status updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update task status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/45"
        onClick={onClose}
        aria-label="Close task details"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]"
      >
        {loading || !task ? (
          <div className="flex min-h-72 items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-slate-400">{task.key}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: task.status.color }} />
                    {task.status.name}
                  </span>
                </div>
                <h2 className="text-lg font-black leading-snug text-slate-900">{task.title}</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-5 overflow-y-auto px-5 py-5">
              {canEdit && (
                <DetailSection title="Update status">
                  <div className="grid grid-cols-3 gap-2">
                    {(['TODO', 'IN_PROGRESS', 'DONE'] as const).map(category => {
                      const categoryStatuses = statuses.filter(item => item.category === category)
                      const status = categoryStatuses.find(item =>
                        category === 'TODO'
                          ? item.isDefault
                          : item.name.toLowerCase() === (category === 'IN_PROGRESS' ? 'in progress' : 'done'),
                      ) ?? categoryStatuses[0]
                      if (!status) return null
                      const active = task.status.category === category
                      const label = category === 'TODO' ? 'To Do' : category === 'IN_PROGRESS' ? 'In Progress' : 'Done'
                      return (
                        <button
                          key={category}
                          type="button"
                          disabled={updatingStatus || active}
                          onClick={() => void updateStatus(status.id)}
                          className={cn(
                            'min-w-0 truncate rounded-xl border px-2 py-2 text-[11px] font-black transition sm:text-xs',
                            active ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                            updatingStatus && 'opacity-60',
                          )}
                          style={active ? { background: status.color } : undefined}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </DetailSection>
              )}

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
                <span className="capitalize">{task.priority.toLowerCase()} priority</span>
                {task.dueDate && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Due {new Date(task.dueDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>

              {task.description && (
                <DetailSection title="Description">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{task.description}</p>
                </DetailSection>
              )}

              <DetailSection title="Assigned to" icon={<UserRound className="h-4 w-4" />}>
                <div className="flex flex-wrap gap-2">
                  {task.assignees.map(person => (
                    <span key={person.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                      {person.firstName} {person.lastName}
                    </span>
                  ))}
                </div>
              </DetailSection>

              {task.labels.length > 0 && (
                <DetailSection title="Labels">
                  <div className="flex flex-wrap gap-2">
                    {task.labels.map(label => (
                      <span key={label.id} className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: label.color, background: `${label.color}18` }}>
                        {label.name}
                      </span>
                    ))}
                  </div>
                </DetailSection>
              )}

              {task.checklist.length > 0 && (
                <DetailSection title="Checklist" icon={<CheckSquare className="h-4 w-4" />}>
                  {(() => {
                    const done = task.checklist.filter(item => item.isDone).length
                    const percent = Math.round((done / task.checklist.length) * 100)
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="text-xs font-black tabular-nums text-slate-500">{percent}%</span>
                        </div>
                        <div className="space-y-2">
                          {task.checklist.map(item => (
                            <label key={item.id} className="flex items-start gap-2.5 rounded-xl border border-slate-100 px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={item.isDone}
                                disabled={!canEdit || savingChecklistIds.has(item.id)}
                                onChange={event => void toggleChecklist(item.id, event.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                              />
                              <span className={cn('text-sm text-slate-700', item.isDone && 'text-slate-400 line-through')}>{item.text}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-[11px] font-semibold text-slate-400">{done} of {task.checklist.length} completed</p>
                      </div>
                    )
                  })()}
                </DetailSection>
              )}

              <DetailSection title="Attachments" icon={<Paperclip className="h-4 w-4" />}>
                <div className="space-y-2">
                  {task.attachments.map(file => (
                    <div key={file.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-700">{file.fileName}</p>
                        <p className="text-[10px] text-slate-400">{formatBytes(file.fileSize)} · {file.uploadedByName}</p>
                      </div>
                      <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-slate-700" aria-label={`Download ${file.fileName}`}>
                        <Download className="h-4 w-4" />
                      </a>
                      {canEdit && file.uploadedByUserId === viewerUserId && (
                        <button type="button" onClick={() => void removeAttachment(file.id)} className="p-1.5 text-slate-400 hover:text-red-600" aria-label={`Remove ${file.fileName}`}>
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {task.attachments.length === 0 && <p className="text-xs text-slate-400">No files attached.</p>}
                  {canEdit && (
                    <label className={cn('flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-xs font-bold text-slate-500 hover:border-slate-400', uploading && 'pointer-events-none opacity-50')}>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploading ? 'Uploading…' : 'Attach a file (max 20 MB)'}
                      <input type="file" className="hidden" disabled={uploading} onChange={event => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) void uploadAttachment(file)
                      }} />
                    </label>
                  )}
                </div>
              </DetailSection>

              <DetailSection title="Notes and comments" icon={<MessageSquare className="h-4 w-4" />}>
                <div className="space-y-2.5">
                  {task.comments.map(comment => (
                    <div key={comment.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <span className="text-xs font-black text-slate-700">{comment.authorName}</span>
                        <span className="text-[10px] text-slate-400">{new Date(comment.createdAt).toLocaleString('en-PH')}</span>
                      </div>
                      <CommentBody body={comment.body} />
                    </div>
                  ))}
                  {task.comments.length === 0 && <p className="text-xs text-slate-400">No notes yet.</p>}
                  <MentionComposer onSubmit={addComment} />
                  <p className="text-[10px] text-slate-400">Type @ to tag someone in your comment.</p>
                </div>
              </DetailSection>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function DetailSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">{icon}{title}</h3>
      {children}
    </section>
  )
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
