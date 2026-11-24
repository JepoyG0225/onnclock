'use client'
import { PermissionGate } from '@/components/auth/PermissionGate'

import { useState, useEffect, useCallback } from 'react'
import { KpiCard } from '@/components/ui/kpi-card'
import { Card, CardContent } from '@/components/ui/card'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Megaphone, Plus, Pencil, Archive, ChevronDown, ChevronUp, Search, RefreshCw, Clock, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Announcement {
  id:          string
  title:       string
  content:     string
  isActive:    boolean
  publishedAt: string
  expiresAt:   string | null
  createdBy:   string
  createdAt:   string
  updatedAt:   string
}

function fmt(d: string) {
  try { return format(new Date(d), 'MMM d, yyyy') } catch { return d }
}

// ─── Announcement Card ────────────────────────────────────────────────────────

interface AnnouncementCardProps {
  item:      Announcement
  isHR:      boolean
  onEdit:    (item: Announcement) => void
  onArchive: (item: Announcement) => void
}

function AnnouncementCard({ item, isHR, onEdit, onArchive }: AnnouncementCardProps) {
  const [expanded, setExpanded] = useState(false)
  const state = !item.isActive ? 'Archived' : item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now() ? 'Expired' : 'Active'
  return <Card className="overflow-hidden rounded-2xl border-slate-200 py-0 shadow-sm transition-shadow hover:shadow-md">
    <CardContent className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#c74300]"><Megaphone className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Company update</p><h3 className="mt-1 break-words text-lg font-semibold leading-6 text-[#162d54]">{item.title}</h3></div></div><Badge className={`shrink-0 border-0 text-white ${state === 'Active' ? 'bg-emerald-600' : state === 'Expired' ? 'bg-amber-600' : 'bg-slate-500'}`}>{state}</Badge></div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Published {fmt(item.publishedAt)}</span>{item.expiresAt && <span>Expires {fmt(item.expiresAt)}</span>}</div>
      <div className={`mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 ${expanded ? '' : 'line-clamp-3'}`}>{item.content}</div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-3"><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(e=>!e)} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#c74300]">{expanded ? <><ChevronUp className="h-4 w-4" />Show less</> : <><ChevronDown className="h-4 w-4" />Read announcement</>}</button>{isHR && <PermissionGate permission="announcements:write"><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={()=>onEdit(item)} aria-label={`Edit ${item.title}`} title="Edit announcement"><Pencil className="h-4 w-4" /></Button>{item.isActive && <Button size="sm" variant="ghost" className="text-slate-500" onClick={()=>onArchive(item)} aria-label={`Archive ${item.title}`} title="Archive announcement"><Archive className="h-4 w-4" /></Button>}</div></PermissionGate>}</div>
    </CardContent>
  </Card>
}

// ─── Form Dialog ──────────────────────────────────────────────────────────────

interface FormDialogProps {
  open:      boolean
  editing:   Announcement | null
  onClose:   () => void
  onSaved:   () => void
}

function FormDialog({ open, editing, onClose, onSaved }: FormDialogProps) {
  const [title,     setTitle]     = useState('')
  const [content,   setContent]   = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    if (editing) {
      setTitle(editing.title)
      setContent(editing.content)
      setExpiresAt(editing.expiresAt ? format(new Date(editing.expiresAt), 'yyyy-MM-dd') : '')
    } else {
      setTitle(''); setContent(''); setExpiresAt('')
    }
  }, [editing, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required')
      return
    }
    setSaving(true)
    try {
      const url    = editing ? `/api/announcements/${editing.id}` : '/api/announcements'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:     title.trim(),
          content:   content.trim(),
          expiresAt: expiresAt || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to save announcement')
        return
      }
      toast.success(editing ? 'Announcement updated' : 'Announcement published')
      onSaved()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Announcement' : 'New Announcement'}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">Keep your team informed with a clear title and the details they need.</p>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Title */}
          <div>
            <label htmlFor="announcement-title" className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <Input id="announcement-title" required data-tour="ann-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Announcement title"
            />
          </div>

          {/* Content */}
          <div>
            <label htmlFor="announcement-content" className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
            <Textarea id="announcement-content" required data-tour="ann-body"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write your announcement here..."
              rows={6}
            />
          </div>

          {/* Expiry */}
          <div>
            <label htmlFor="announcement-expiry" className="block text-sm font-medium text-gray-700 mb-1">
              Expiry Date <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Input
              id="announcement-expiry"
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={saving}

            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Publish'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const [tab,          setTab]          = useState<'active' | 'expired' | 'archived' | 'all'>('active')
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading,      setLoading]      = useState(true)
  const [isHR,         setIsHR]         = useState(false)
  const [showForm,     setShowForm]     = useState(false)
  const [editing,      setEditing]      = useState<Announcement | null>(null)

  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  // Determine role
  useEffect(() => {
    fetch('/api/users/me')
      .then(r => r.json())
      .then(d => {
        const role = d.role ?? ''
        setIsHR(['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN'].includes(role))
      })
      .catch(() => {})
  }, [])

  const loadAnnouncements = useCallback(async () => {
    setLoading(true)
    try {
      setError('')
      const isActiveParam = 'all'
      const res = await fetch(`/api/announcements?isActive=${isActiveParam}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setAnnouncements(data.announcements ?? [])
    } catch {
      setError('Unable to load announcements. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAnnouncements() }, [loadAnnouncements])

  async function handleArchive(item: Announcement) {
    if (!window.confirm(`Archive "${item.title}"? It will no longer appear as an active announcement.`)) return
    try {
      const res = await fetch(`/api/announcements/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      if (!res.ok) {
        toast.error('Failed to archive')
        return
      }
      toast.success('Announcement archived')
      loadAnnouncements()
    } catch {
      toast.error('Network error')
    }
  }

  const stateOf = (a: Announcement) => !a.isActive ? 'archived' : a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now() ? 'expired' : 'active'
  const active = announcements.filter(a => stateOf(a) === 'active')
  const expired = announcements.filter(a => stateOf(a) === 'expired')
  const archived = announcements.filter(a => stateOf(a) === 'archived')
  const displayed = announcements.filter(a => (tab === 'all' || stateOf(a) === tab) && `${a.title} ${a.content}`.toLowerCase().includes(search.trim().toLowerCase()))
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#c74300]">Keep everyone connected</p><h1 className="text-2xl font-bold text-[#162d54]">Announcements</h1><p className="mt-1 text-sm text-slate-500">Company news, important reminders, and updates for your team.</p></div><div className="flex gap-2"><Button variant="outline" aria-label="Refresh announcements" disabled={loading} onClick={loadAnnouncements}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>{isHR && <PermissionGate permission="announcements:write"><Button data-tour="ann-new" onClick={()=>{setEditing(null);setShowForm(true)}}><Plus className="mr-2 h-4 w-4" />New announcement</Button></PermissionGate>}</div></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="All announcements" value={loading || error ? '...' : announcements.length} icon={<Megaphone />} tone="primary" onClick={()=>setTab('all')} />
        <KpiCard label="Active" value={loading || error ? '...' : active.length} icon={<CheckCircle2 />} tone="accent" onClick={()=>setTab('active')} />
        <KpiCard label="Expired" value={loading || error ? '...' : expired.length} icon={<Clock />} tone="warning" onClick={()=>setTab('expired')} />
        <KpiCard label="Archived" value={loading || error ? '...' : archived.length} icon={<Archive />} tone="neutral" onClick={()=>setTab('archived')} />
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-1" aria-label="Announcement status">{(['active','expired','archived','all'] as const).map(value=><button type="button" key={value} aria-pressed={tab===value} onClick={()=>setTab(value)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${tab===value ? 'bg-[#ff5900] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{value.charAt(0).toUpperCase()+value.slice(1)}</button>)}</div><label className="relative sm:w-72"><span className="sr-only">Search announcements</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search announcements" className="h-10 pl-9" /></label></div>
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}<Button variant="outline" className="ml-3" onClick={loadAnnouncements}>Retry</Button></div> : loading ? <AppSpinner message="Loading announcements..." className="py-16" /> : displayed.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center"><span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#c74300]"><Megaphone className="h-6 w-6" /></span><h2 className="font-semibold text-[#162d54]">{search ? 'No matching announcements' : 'No announcements here yet'}</h2><p className="mt-2 text-sm text-slate-500">{search ? 'Try another keyword or change the status filter.' : 'Published updates will appear here for your team.'}</p>{search && <Button variant="outline" className="mt-4" onClick={()=>setSearch('')}>Clear search</Button>}</div> : <><p className="text-xs text-slate-500">{displayed.length} announcement{displayed.length===1 ? '' : 's'} | Newest first</p><div className="grid items-start gap-4 xl:grid-cols-2">{displayed.map(item=><AnnouncementCard key={item.id} item={item} isHR={isHR} onEdit={a=>{setEditing(a);setShowForm(true)}} onArchive={handleArchive} />)}</div></>}

      {/* Form Dialog */}
      <FormDialog
        open={showForm}
        editing={editing}
        onClose={() => { setShowForm(false); setEditing(null) }}
        onSaved={() => { setShowForm(false); setEditing(null); loadAnnouncements() }}
      />
    </div>
  )
}
