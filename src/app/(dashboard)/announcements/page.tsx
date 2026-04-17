'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
import { Megaphone, Plus, Pencil, Archive, ChevronDown, ChevronUp } from 'lucide-react'
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
  const isArchived = !item.isActive

  return (
    <Card className={isArchived ? 'opacity-60' : undefined}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className={`font-semibold text-base ${isArchived ? 'text-gray-500' : 'text-gray-900'}`}>
                {item.title}
              </h3>
              <Badge
                className={`text-xs border-0 flex-shrink-0 ${
                  isArchived ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-800'
                }`}
              >
                {isArchived ? 'Archived' : 'Active'}
              </Badge>
            </div>

            {/* Dates */}
            <p className="text-xs text-gray-400 mb-3">
              Published {fmt(item.publishedAt)}
              {item.expiresAt && (
                <span className="ml-2 text-orange-500">
                  · Expires {fmt(item.expiresAt)}
                </span>
              )}
            </p>

            {/* Content */}
            <div
              className={`text-sm text-gray-700 whitespace-pre-line ${
                !expanded ? 'line-clamp-3' : ''
              }`}
            >
              {item.content}
            </div>

            {/* Expand toggle */}
            {item.content.length > 200 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-1 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {expanded ? (
                  <><ChevronUp className="w-3 h-3" /> Show less</>
                ) : (
                  <><ChevronDown className="w-3 h-3" /> Show more</>
                )}
              </button>
            )}
          </div>

          {/* Actions */}
          {isHR && (
            <div className="flex gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(item)}
                className="h-8 px-2"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              {item.isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onArchive(item)}
                  className="h-8 px-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                  title="Archive"
                >
                  <Archive className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
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
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Announcement' : 'New Announcement'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Announcement title"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write your announcement here..."
              rows={6}
            />
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expiry Date <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={saving}
              style={{ background: '#1A2D42' }}
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
  const [tab,          setTab]          = useState<'active' | 'all'>('active')
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading,      setLoading]      = useState(true)
  const [isHR,         setIsHR]         = useState(false)
  const [showForm,     setShowForm]     = useState(false)
  const [editing,      setEditing]      = useState<Announcement | null>(null)

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
      const isActiveParam = tab === 'active' ? 'true' : 'all'
      const res = await fetch(`/api/announcements?isActive=${isActiveParam}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setAnnouncements(data.announcements ?? [])
    } catch {
      toast.error('Failed to load announcements')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { loadAnnouncements() }, [loadAnnouncements])

  async function handleArchive(item: Announcement) {
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

  // Split for "all" tab
  const active   = announcements.filter(a => a.isActive)
  const archived = announcements.filter(a => !a.isActive)
  const displayed = tab === 'active' ? active : announcements

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-gray-500 mt-1">
            {tab === 'active'
              ? `${active.length} active announcement${active.length !== 1 ? 's' : ''}`
              : `${announcements.length} total announcement${announcements.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        {isHR && (
          <Button
            onClick={() => { setEditing(null); setShowForm(true) }}
            style={{ background: '#1A2D42' }}
          >
            <Plus className="mr-2 w-4 h-4" />
            New Announcement
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={tab === 'active' ? 'default' : 'outline'}
          onClick={() => setTab('active')}
          style={tab === 'active' ? { background: '#1A2D42' } : {}}
        >
          Active
        </Button>
        <Button
          size="sm"
          variant={tab === 'all' ? 'default' : 'outline'}
          onClick={() => setTab('all')}
          style={tab === 'all' ? { background: '#1A2D42' } : {}}
        >
          All
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16">
          <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {tab === 'active' ? 'No active announcements' : 'No announcements yet'}
          </p>
          {isHR && tab === 'active' && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => { setEditing(null); setShowForm(true) }}
            >
              <Plus className="mr-2 w-4 h-4" />
              Create First Announcement
            </Button>
          )}
        </div>
      ) : tab === 'all' ? (
        /* All tab: show active then archived sections */
        <div className="space-y-6">
          {active.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Active</h2>
              {active.map(item => (
                <AnnouncementCard
                  key={item.id}
                  item={item}
                  isHR={isHR}
                  onEdit={a => { setEditing(a); setShowForm(true) }}
                  onArchive={handleArchive}
                />
              ))}
            </div>
          )}
          {archived.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Archived</h2>
              {archived.map(item => (
                <AnnouncementCard
                  key={item.id}
                  item={item}
                  isHR={isHR}
                  onEdit={a => { setEditing(a); setShowForm(true) }}
                  onArchive={handleArchive}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Active tab */
        <div className="space-y-3">
          {displayed.map(item => (
            <AnnouncementCard
              key={item.id}
              item={item}
              isHR={isHR}
              onEdit={a => { setEditing(a); setShowForm(true) }}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

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
