'use client'

/**
 * Full task creation form: title, due date, assignees, notes, attachments.
 *
 * Attachments are the reason this is a two-phase save. A file can only be
 * attached to a task that already exists (the upload route is
 * /api/tasks/[id]/attachments), so the task is created first and the files
 * are uploaded against the returned id. If an upload fails the task is NOT
 * rolled back — losing someone's typed-out task because one PDF failed would
 * be worse than a task with a missing file, so the dialog reports which
 * files didn't make it and leaves the task in place.
 */

import { useRef, useState } from 'react'
import { CheckSquare, FileText, Loader2, Paperclip, Plus, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { initialsOf, avatarTint, fullName, type EmployeeBrief, type Priority, type TaskStatus } from './types'

const MAX_BYTES = 20 * 1024 * 1024

export function CreateTaskDialog({
  statuses,
  employees,
  defaultStatusId,
  onClose,
  onCreated,
}: {
  statuses: TaskStatus[]
  employees: EmployeeBrief[]
  defaultStatusId?: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [statusId, setStatusId] = useState(defaultStatusId ?? statuses[0]?.id ?? '')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [checklist, setChecklist] = useState<string[]>([])
  const [checklistDraft, setChecklistDraft] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const filtered = employees
    .filter(e =>
      !assigneeQuery.trim() ||
      `${e.firstName} ${e.lastName} ${e.employeeNo}`.toLowerCase().includes(assigneeQuery.trim().toLowerCase()),
    )
    .slice(0, 6)

  const selected = employees.filter(e => assigneeIds.includes(e.id))

  const addFiles = (picked: FileList | null) => {
    if (!picked) return
    const next: File[] = []
    for (const f of Array.from(picked)) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is over the 20 MB limit`)
        continue
      }
      next.push(f)
    }
    setFiles(prev => [...prev, ...next])
  }

  const submit = async () => {
    if (!title.trim()) {
      toast.error('Give the task a title')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: notes.trim() || null,
          statusId: statusId || undefined,
          priority,
          dueDate: dueDate || null,
          assigneeEmployeeIds: assigneeIds,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Could not create the task')
      }
      const { task } = await res.json()

      // Phase two: add checklist items and attachments to the task we just created.
      const failedChecklist: string[] = []
      for (const text of checklist) {
        const item = await fetch(`/api/tasks/${task.id}/checklist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!item.ok) failedChecklist.push(text)
      }

      const failed: string[] = []
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        const up = await fetch(`/api/tasks/${task.id}/attachments`, { method: 'POST', body: fd })
        if (!up.ok) failed.push(file.name)
      }

      if (failed.length || failedChecklist.length) {
        const failures = [
          failedChecklist.length ? `${failedChecklist.length} checklist item${failedChecklist.length === 1 ? '' : 's'}` : '',
          failed.length ? `${failed.length} file${failed.length === 1 ? '' : 's'}` : '',
        ].filter(Boolean).join(' and ')
        toast.warning(
          `Task created, but ${failures} could not be saved.`,
        )
      } else {
        toast.success('Task created')
      }
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Only a title is required — everything else can be filled in later from the task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs doing?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="task-priority">Priority</Label>
              <select
                id="task-priority"
                value={priority}
                onChange={e => setPriority(e.target.value as Priority)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="task-status">Status</Label>
            <select
              id="task-status"
              value={statusId}
              onChange={e => setStatusId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Assignees */}
          <div data-tour="task-assignees">
            <Label>Assignees</Label>
            {selected.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {selected.map(e => (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-2 text-xs"
                  >
                    <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold', avatarTint(e.id))}>
                      {initialsOf(e)}
                    </span>
                    {fullName(e)}
                    <button
                      type="button"
                      onClick={() => setAssigneeIds(prev => prev.filter(id => id !== e.id))}
                      aria-label={`Remove ${fullName(e)}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              value={assigneeQuery}
              onChange={e => setAssigneeQuery(e.target.value)}
              placeholder="Search employees…"
              className="mt-1.5"
            />
            {assigneeQuery.trim() && (
              <div className="mt-1 max-h-36 overflow-y-auto rounded-md border border-border">
                {filtered.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">No matching employees.</p>
                ) : (
                  filtered.map(e => {
                    const on = assigneeIds.includes(e.id)
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          setAssigneeIds(prev => on ? prev.filter(id => id !== e.id) : [...prev, e.id])
                          setAssigneeQuery('')
                        }}
                        className="flex w-full items-center gap-2 border-b border-border px-2 py-1.5 text-left last:border-0 hover:bg-muted/50"
                      >
                        <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold', avatarTint(e.id))}>
                          {initialsOf(e)}
                        </span>
                        <span className="text-sm">{fullName(e)}</span>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{e.employeeNo}</span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Context, links, acceptance criteria…"
            />
          </div>

          <div>
            <Label htmlFor="task-checklist">Checklist</Label>
            {checklist.length > 0 && (
              <ul className="mt-1 space-y-1">
                {checklist.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                    <CheckSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 text-sm">{item}</span>
                    <button type="button" onClick={() => setChecklist(items => items.filter((_, i) => i !== index))} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${item}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1.5 flex gap-2">
              <Input
                id="task-checklist"
                value={checklistDraft}
                onChange={e => setChecklistDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  const item = checklistDraft.trim()
                  if (item) { setChecklist(items => [...items, item]); setChecklistDraft('') }
                }}
                placeholder="Add something that needs to be done…"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => {
                const item = checklistDraft.trim()
                if (item) { setChecklist(items => [...items, item]); setChecklistDraft('') }
              }} aria-label="Add checklist item">
                <Plus />
              </Button>
            </div>
          </div>

          {/* Attachments */}
          <div data-tour="task-attachments">
            <Label>Attachments</Label>
            {files.length > 0 && (
              <ul className="mt-1 space-y-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border border-border p-1.5">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {f.size >= 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove ${f.name}`}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              <Upload className="h-3.5 w-3.5" />
              Attach files (max 20 MB each)
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={e => { addFiles(e.target.files); e.target.value = '' }}
            />
            {files.length > 0 && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                Uploaded after the task is created.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" data-tour="task-cancel" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !title.trim()}>
            {saving && <Loader2 className="animate-spin" />}
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
