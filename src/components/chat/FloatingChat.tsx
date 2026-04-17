'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  MessageCircle,
  MessageSquare,
  Plus,
  Send,
  Users,
  X,
  Check,
  Search,
  UserPlus,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact = {
  userId: string
  label: string
  subLabel: string | null
  role: string
  online: boolean
  lastMessage: string | null
  lastMessageAt: string | null
  lastMessageByMe: boolean
  unreadCount: number
}

type ChatGroup = {
  id: string
  name: string
  memberCount: number
  memberUserIds: string[]
  lastMessage: string | null
  lastMessageAt: string | null
  lastMessageByMe: boolean
  unreadCount: number
}

type ChatMessage = {
  id: string
  senderUserId: string
  senderName?: string | null
  receiverUserId?: string | null
  body: string
  createdAt: string
}

type ActiveConv = { type: 'dm'; userId: string } | { type: 'group'; groupId: string }

// ─── WebSocket URL ────────────────────────────────────────────────────────────

function resolveWsBaseUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_WS_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  if (typeof window === 'undefined') return null
  const host = window.location.hostname.toLowerCase()
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  if (!isLocal) return null
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}`
}

// ─── Avatar initial ───────────────────────────────────────────────────────────

function Avatar({ name, size = 32, online }: { name: string; size?: number; online?: boolean }) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?'
  const colors = ['#2E4156', '#1A5276', '#145A32', '#6E2F8A', '#7B241C', '#1A5276']
  const idx = name.charCodeAt(0) % colors.length
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full flex items-center justify-center text-white font-bold"
        style={{ width: size, height: size, background: colors[idx], fontSize: size * 0.42 }}
      >
        {initial}
      </div>
      {online !== undefined && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-white"
          style={{
            width: size * 0.32,
            height: size * 0.32,
            background: online ? '#22c55e' : '#94a3b8',
          }}
        />
      )}
    </div>
  )
}

// ─── Create Group Modal ───────────────────────────────────────────────────────

function CreateGroupModal({
  contacts,
  onClose,
  onCreated,
}: {
  contacts: Contact[]
  onClose: () => void
  onCreated: (group: ChatGroup) => void
}) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return contacts.filter(c => !q || c.label.toLowerCase().includes(q) || (c.subLabel ?? '').toLowerCase().includes(q))
  }, [contacts, search])

  function toggle(userId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function handleCreate() {
    if (!name.trim()) { setErr('Enter a group name'); return }
    if (selected.size < 1) { setErr('Select at least 1 member'); return }
    setSaving(true)
    setErr('')
    try {
      const res = await fetch('/api/chat/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), memberIds: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Failed to create group'); return }
      onCreated(data.group)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#E5E9EA' }}>
          <p className="font-semibold text-sm text-slate-800">New Group Chat</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          {/* Group name */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Group Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Team Announcements"
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1A2D42]/20"
              style={{ borderColor: '#D4D8DD' }}
              autoFocus
            />
          </div>

          {/* Member search */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Members ({selected.size} selected)
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search people..."
                className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none"
                style={{ borderColor: '#D4D8DD' }}
              />
            </div>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {filtered.map(c => (
                <button
                  key={c.userId}
                  onClick={() => toggle(c.userId)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
                >
                  <div
                    className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      borderColor: selected.has(c.userId) ? '#1A2D42' : '#D4D8DD',
                      background: selected.has(c.userId) ? '#1A2D42' : 'transparent',
                    }}
                  >
                    {selected.has(c.userId) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <Avatar name={c.label} size={28} online={c.online} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{c.label}</p>
                    {c.subLabel && <p className="text-[10px] text-slate-400 truncate">{c.subLabel}</p>}
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3">No results</p>
              )}
            </div>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>

        <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: '#E5E9EA' }}>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            style={{ borderColor: '#D4D8DD' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
            style={{ background: '#1A2D42' }}
          >
            {saving ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Members Modal ───────────────────────────────────────────────────────

function AddMembersModal({
  groupId,
  groupName,
  existingMemberIds,
  contacts,
  onClose,
  onAdded,
}: {
  groupId: string
  groupName: string
  existingMemberIds: string[]
  contacts: Contact[]
  onClose: () => void
  onAdded: (memberCount: number, memberUserIds: string[]) => void
}) {
  const existing = new Set(existingMemberIds)
  const eligible = contacts.filter(c => !existing.has(c.userId))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return eligible.filter(c => !q || c.label.toLowerCase().includes(q) || (c.subLabel ?? '').toLowerCase().includes(q))
  }, [eligible, search])

  function toggle(userId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function handleAdd() {
    if (selected.size === 0) { setErr('Select at least 1 person'); return }
    setSaving(true)
    setErr('')
    try {
      const res = await fetch(`/api/chat/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Failed to add members'); return }
      onAdded(data.memberCount, data.memberUserIds)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#E5E9EA' }}>
          <div>
            <p className="font-semibold text-sm text-slate-800">Add Members</p>
            <p className="text-[11px] text-slate-400 truncate">{groupName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 flex-1 overflow-y-auto space-y-2">
          {eligible.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Everyone is already in this group</p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search people..."
                  className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none"
                  style={{ borderColor: '#D4D8DD' }}
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-slate-400 px-1">{selected.size} selected</p>
              <div className="space-y-0.5">
                {filtered.map(c => (
                  <button
                    key={c.userId}
                    onClick={() => toggle(c.userId)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 text-left"
                  >
                    <div
                      className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                      style={{
                        borderColor: selected.has(c.userId) ? '#1A2D42' : '#D4D8DD',
                        background: selected.has(c.userId) ? '#1A2D42' : 'transparent',
                      }}
                    >
                      {selected.has(c.userId) && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <Avatar name={c.label} size={28} online={c.online} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{c.label}</p>
                      {c.subLabel && <p className="text-[10px] text-slate-400 truncate">{c.subLabel}</p>}
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-3">No results</p>}
              </div>
            </>
          )}
          {err && <p className="text-xs text-red-500 px-1">{err}</p>}
        </div>

        <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: '#E5E9EA' }}>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border text-sm font-medium text-slate-600 hover:bg-slate-50"
            style={{ borderColor: '#D4D8DD' }}
          >
            Cancel
          </button>
          {eligible.length > 0 && (
            <button
              onClick={handleAdd}
              disabled={saving || selected.size === 0}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#1A2D42' }}
            >
              {saving ? 'Adding…' : `Add ${selected.size > 0 ? `(${selected.size})` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main FloatingChat ────────────────────────────────────────────────────────

export function FloatingChat({ portal = false }: { portal?: boolean }) {
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileView, setMobileView] = useState<'contacts' | 'conversation'>('contacts')
  const [tab, setTab] = useState<'direct' | 'groups'>('direct')
  const [meUserId, setMeUserId] = useState<string | null>(null)
  const [meRole, setMeRole] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<ChatGroup[]>([])
  const [activeConv, setActiveConv] = useState<ActiveConv | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [dmSearch, setDmSearch] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)
  const msgFetchRef = useRef(false)
  const optimisticIds = useRef<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const portalMobile = portal && isMobile

  // Allow external controls (e.g. portal bottom dock) to toggle chat
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onToggle = () => {
      setOpen(prev => !prev)
      if (portalMobile) setMobileView('contacts')
    }
    window.addEventListener('chat:toggle', onToggle as EventListener)
    return () => window.removeEventListener('chat:toggle', onToggle as EventListener)
  }, [portalMobile])

  // ── Responsive ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 768px)')
    const onChange = () => setIsMobile(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  // ── Me ──
  useEffect(() => {
    let active = true
    fetch('/api/users/me')
      .then(r => r.json())
      .then(data => {
        if (!active) return
        setMeRole(data.role ?? null)
        setMeUserId(data.user?.id ?? null)
        setCompanyId(data.company?.id ?? null)
      })
      .catch(() => null)
    return () => { active = false }
  }, [])

  // ── Presence ping ──
  useEffect(() => {
    if (!meRole || !open) return
    const ping = () => {
      if (document.visibilityState === 'hidden') return
      fetch('/api/chat/presence', { method: 'POST' }).catch(() => null)
    }
    ping()
    const id = window.setInterval(ping, 90_000)
    return () => window.clearInterval(id)
  }, [meRole, open])

  // ── Load contacts & groups ──
  const loadContacts = useCallback(async () => {
    if (!meRole) return
    if (document.visibilityState === 'hidden') return
    try {
      const cRes = await fetch('/api/chat/contacts')
      if (cRes.ok) {
        const data = await cRes.json()
        setContacts(data.contacts ?? [])
      }
      const gRes = await fetch('/api/chat/groups')
      if (gRes.ok) {
        const data = await gRes.json()
        setGroups(data.groups ?? [])
      }
    } catch { /* ignore */ }
  }, [meRole])

  useEffect(() => {
    if (!meRole || !open) return
    if (!hasLoaded) setLoadingContacts(true)
    loadContacts().finally(() => {
      setLoadingContacts(false)
      setHasLoaded(true)
    })
    const id = window.setInterval(loadContacts, 90_000)
    return () => window.clearInterval(id)
  }, [meRole, open, hasLoaded, loadContacts])

  // ── Load messages ──
  useEffect(() => {
    if (!open || !activeConv) return
    let active = true

    const load = async (showLoader: boolean) => {
      if (document.visibilityState === 'hidden') return
      if (msgFetchRef.current) return
      msgFetchRef.current = true
      if (showLoader && active) setLoadingMessages(true)
      try {
        let url = ''
        if (activeConv.type === 'dm') url = `/api/chat/messages?withUserId=${encodeURIComponent(activeConv.userId)}`
        else url = `/api/chat/groups/${activeConv.groupId}`

        const res = await fetch(url)
        if (!res.ok) return
        const data = await res.json()
        if (active) setMessages(data.messages ?? [])

        // Mark read
        if (activeConv.type === 'dm') {
          await fetch('/api/chat/messages', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ withUserId: activeConv.userId }),
          }).catch(() => null)
          setContacts(prev => prev.map(c =>
            c.userId === activeConv.userId ? { ...c, unreadCount: 0 } : c
          ))
        } else {
          await fetch(`/api/chat/groups/${activeConv.groupId}`, { method: 'PATCH' }).catch(() => null)
          setGroups(prev => prev.map(g =>
            g.id === activeConv.groupId ? { ...g, unreadCount: 0 } : g
          ))
        }
      } finally {
        msgFetchRef.current = false
        if (showLoader && active) setLoadingMessages(false)
      }
    }

    setMessages([])
    load(true)
    const id = window.setInterval(() => load(false), 30_000)
    return () => {
      active = false
      window.clearInterval(id)
      msgFetchRef.current = false
    }
  }, [activeConv, open])

  // ── WebSocket ──
  useEffect(() => {
    if (!open || !companyId || !meUserId) return
    const wsBase = resolveWsBaseUrl()
    if (!wsBase) return

    const ws = new WebSocket(`${wsBase}/ws?companyId=${encodeURIComponent(companyId)}&userId=${encodeURIComponent(meUserId)}`)

    ws.onmessage = event => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(event.data) } catch { return }

      if (msg.type === 'chat_presence' && msg.userId) {
        setContacts(prev => prev.map(c =>
          c.userId === msg.userId ? { ...c, online: !!msg.online } : c
        ))
        return
      }

      if (msg.type === 'chat_message' && msg.message) {
        const incoming = msg.message as ChatMessage
        const otherId = incoming.senderUserId === meUserId ? incoming.receiverUserId : incoming.senderUserId
        if (!otherId) return

        setContacts(prev => prev.map(c =>
          c.userId === otherId
            ? { ...c, lastMessage: incoming.body, lastMessageAt: incoming.createdAt, lastMessageByMe: incoming.senderUserId === meUserId }
            : c
        ))

        const isActive = open && activeConv?.type === 'dm' && activeConv.userId === otherId
        if (isActive) {
          setMessages(prev => {
            if (incoming.senderUserId === meUserId) {
              const opts = [...optimisticIds.current]
              if (opts.length > 0) {
                const matched = prev.find(m => opts.includes(m.id) && m.body === incoming.body)
                if (matched) { optimisticIds.current.delete(matched.id); return prev.map(m => m.id === matched.id ? incoming : m) }
              }
            }
            if (prev.some(m => m.id === incoming.id)) return prev
            return [...prev, incoming]
          })
          if (incoming.senderUserId !== meUserId) {
            fetch('/api/chat/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ withUserId: otherId }) }).catch(() => null)
            setContacts(prev => prev.map(c => c.userId === otherId ? { ...c, unreadCount: 0 } : c))
          }
        } else if (incoming.senderUserId !== meUserId) {
          setContacts(prev => prev.map(c => c.userId === otherId ? { ...c, unreadCount: (c.unreadCount ?? 0) + 1 } : c))
        }
        return
      }

      if (msg.type === 'chat_group_message' && msg.groupId && msg.message) {
        const incoming = msg.message as ChatMessage
        const gid = msg.groupId as string
        setGroups(prev => prev.map(g =>
          g.id === gid
            ? { ...g, lastMessage: incoming.body, lastMessageAt: incoming.createdAt, lastMessageByMe: incoming.senderUserId === meUserId }
            : g
        ))
        const isActive = open && activeConv?.type === 'group' && activeConv.groupId === gid
        if (isActive) {
          setMessages(prev => {
            if (prev.some(m => m.id === incoming.id)) return prev
            return [...prev, incoming]
          })
          if (incoming.senderUserId !== meUserId) {
            fetch(`/api/chat/groups/${gid}`, { method: 'PATCH' }).catch(() => null)
          }
        } else if (incoming.senderUserId !== meUserId) {
          setGroups(prev => prev.map(g => g.id === gid ? { ...g, unreadCount: (g.unreadCount ?? 0) + 1 } : g))
        }
        return
      }

      if (msg.type === 'chat_group_created') {
        loadContacts()
      }
    }

    return () => ws.close()
  }, [companyId, meUserId, open, activeConv, loadContacts])

  // ── Auto-scroll ──
  useEffect(() => {
    if (!open) return
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, messages.length])

  // ── Send ──
  async function sendMessage() {
    if (!activeConv || !draft.trim() || sending) return
    const text = draft.trim()
    const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: ChatMessage = {
      id: optimisticId,
      senderUserId: meUserId ?? '',
      senderName: 'You',
      body: text,
      createdAt: new Date().toISOString(),
    }
    optimisticIds.current.add(optimisticId)
    setMessages(prev => [...prev, optimistic])
    setDraft('')
    setSending(true)
    try {
      let url = ''
      let reqBody = {}
      if (activeConv.type === 'dm') {
        url = '/api/chat/messages'
        reqBody = { withUserId: activeConv.userId, message: text }
        setContacts(prev => prev.map(c =>
          c.userId === activeConv.userId ? { ...c, lastMessage: text, lastMessageAt: optimistic.createdAt, lastMessageByMe: true } : c
        ))
      } else {
        url = `/api/chat/groups/${activeConv.groupId}`
        reqBody = { message: text }
        setGroups(prev => prev.map(g =>
          g.id === activeConv.groupId ? { ...g, lastMessage: text, lastMessageAt: optimistic.createdAt, lastMessageByMe: true } : g
        ))
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      })
      if (!res.ok) {
        optimisticIds.current.delete(optimisticId)
        setMessages(prev => prev.filter(m => m.id !== optimisticId))
        setDraft(text)
        return
      }
      const data = (await res.json().catch(() => null)) as { message?: ChatMessage } | null
      if (data?.message) {
        optimisticIds.current.delete(optimisticId)
        setMessages(prev => prev.map(m => m.id === optimisticId ? data.message! : m))
      }
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function selectDm(userId: string) {
    setActiveConv({ type: 'dm', userId })
    if (portalMobile) setMobileView('conversation')
  }

  function selectGroup(groupId: string) {
    setActiveConv({ type: 'group', groupId })
    if (portalMobile) setMobileView('conversation')
  }

  // Filtered DMs — must be before early return (hooks order)
  const filteredContacts = useMemo(() => {
    const q = dmSearch.toLowerCase()
    return contacts.filter(c => !q || c.label.toLowerCase().includes(q) || (c.subLabel ?? '').toLowerCase().includes(q))
  }, [contacts, dmSearch])

  // Totals
  const totalUnread =
    contacts.reduce((s, c) => s + (c.unreadCount ?? 0), 0) +
    groups.reduce((s, g) => s + (g.unreadCount ?? 0), 0)

  // Active contact/group info
  const activeDmContact = activeConv?.type === 'dm' ? contacts.find(c => c.userId === activeConv.userId) : null
  const activeGroup = activeConv?.type === 'group' ? groups.find(g => g.id === activeConv.groupId) : null
  const activeTitle = activeDmContact?.label ?? activeGroup?.name ?? 'Select a conversation'
  const activeSubtitle = activeDmContact
    ? (activeDmContact.online ? '🟢 Online' : '⚫ Offline')
    : activeGroup
      ? `${activeGroup.memberCount} members`
      : ''

  // Allow chat when SUPER_ADMIN is impersonating a company role.
  if (!meRole || meRole === 'SUPER_ADMIN') return null

  // Bottom dock height on portal ≈ 88px (frosted pill + safe-area padding)
  const DOCK_H = 96
  const panelStyle: React.CSSProperties = portalMobile
    ? { left: 8, right: 8, top: 64, bottom: DOCK_H, width: 'auto' }
    : { right: 20, width: 520, bottom: portal ? DOCK_H + 8 : 20, height: 580 }

  return (
    <>
      {showCreateGroup && (
        <CreateGroupModal
          contacts={contacts}
          onClose={() => setShowCreateGroup(false)}
          onCreated={group => {
            setGroups(prev => [group, ...prev])
            setTab('groups')
            selectGroup(group.id)
          }}
        />
      )}

      {showAddMembers && activeGroup && (
        <AddMembersModal
          groupId={activeGroup.id}
          groupName={activeGroup.name}
          existingMemberIds={activeGroup.memberUserIds}
          contacts={contacts}
          onClose={() => setShowAddMembers(false)}
          onAdded={(memberCount, memberUserIds) => {
            setGroups(prev => prev.map(g =>
              g.id === activeGroup.id ? { ...g, memberCount, memberUserIds } : g
            ))
          }}
        />
      )}

      {open && (
        <div
          className="fixed z-[70] rounded-2xl border shadow-2xl overflow-hidden bg-white flex flex-col"
          style={{ ...panelStyle, borderColor: '#D4D8DD' }}
        >
          {/* ── Top bar ── */}
          <div className="flex items-center justify-between px-4 py-3 text-white flex-shrink-0" style={{ background: '#1A2D42' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              {portalMobile && mobileView === 'conversation' && (
                <button onClick={() => setMobileView('contacts')} className="p-1 rounded hover:bg-white/10">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {activeConv && (!portalMobile || mobileView === 'conversation') ? (
                <>
                  {activeDmContact && (
                    <Avatar name={activeDmContact.label} size={28} online={activeDmContact.online} />
                  )}
                  {activeGroup && (
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{activeTitle}</p>
                    <p className="text-[11px] text-white/60 truncate">{activeSubtitle}</p>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-white/70" />
                  <p className="text-sm font-semibold">Team Chat</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {activeGroup && (!portalMobile || mobileView === 'conversation') && (
                <button
                  onClick={() => setShowAddMembers(true)}
                  className="p-1.5 rounded hover:bg-white/10 transition-colors"
                  title="Add members"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} data-chat-close className="p-1 rounded hover:bg-white/10 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Body ── */}
          <div
            className="flex-1 min-h-0 overflow-hidden"
            style={{
              display: 'grid',
              gridTemplateColumns: portalMobile ? '1fr' : '200px 1fr',
              gridTemplateRows: '1fr',
            }}
          >
            {/* ── Contact/Group list ── */}
            <div
              className={`flex flex-col border-r overflow-hidden ${portalMobile && mobileView === 'conversation' ? 'hidden' : ''}`}
              style={{ borderColor: '#E5E9EA', background: '#F8FAFB' }}
            >
              {/* Tabs */}
              <div className="flex border-b flex-shrink-0" style={{ borderColor: '#E5E9EA' }}>
                <button
                  onClick={() => setTab('direct')}
                  className="flex-1 py-2 text-[11px] font-semibold transition-colors"
                  style={{ color: tab === 'direct' ? '#1A2D42' : '#94a3b8', borderBottom: tab === 'direct' ? '2px solid #1A2D42' : '2px solid transparent' }}
                >
                  Direct
                </button>
                <button
                  onClick={() => setTab('groups')}
                  className="flex-1 py-2 text-[11px] font-semibold transition-colors relative"
                  style={{ color: tab === 'groups' ? '#1A2D42' : '#94a3b8', borderBottom: tab === 'groups' ? '2px solid #1A2D42' : '2px solid transparent' }}
                >
                  Groups
                  {groups.reduce((s, g) => s + g.unreadCount, 0) > 0 && (
                    <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-orange-500" />
                  )}
                </button>
              </div>

              {tab === 'direct' && (
                <>
                  {/* Search */}
                  <div className="px-2 py-1.5 flex-shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                      <input
                        value={dmSearch}
                        onChange={e => setDmSearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full pl-6 pr-2 py-1 text-[11px] border rounded-md outline-none bg-white"
                        style={{ borderColor: '#E5E9EA' }}
                      />
                    </div>
                  </div>

                  {/* Contact list */}
                  <div className="flex-1 overflow-y-auto">
                    {loadingContacts && !hasLoaded ? (
                      <div className="p-2 space-y-2">
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className="h-10 rounded-lg bg-slate-200/70 animate-pulse" />
                        ))}
                      </div>
                    ) : filteredContacts.length === 0 ? (
                      <p className="text-[11px] text-slate-400 text-center py-4">No contacts</p>
                    ) : (
                      filteredContacts.map(c => {
                        const isActive = activeConv?.type === 'dm' && activeConv.userId === c.userId
                        return (
                          <button
                            key={c.userId}
                            onClick={() => selectDm(c.userId)}
                            className="w-full text-left px-2.5 py-2 border-b hover:bg-white transition-colors"
                            style={{
                              borderColor: '#F1F5F7',
                              background: isActive ? '#fff' : undefined,
                              boxShadow: isActive ? 'inset 3px 0 0 #1A2D42' : undefined,
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              <Avatar name={c.label} size={24} online={c.online} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <p className="text-[11px] font-semibold text-slate-700 truncate">{c.label}</p>
                                  {(c.unreadCount ?? 0) > 0 && (
                                    <span className="flex-shrink-0 min-w-[16px] h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold px-1 flex items-center justify-center">
                                      {c.unreadCount}
                                    </span>
                                  )}
                                </div>
                                {c.lastMessage && (
                                  <p className="text-[10px] text-slate-400 truncate">
                                    {c.lastMessageByMe ? 'You: ' : ''}{c.lastMessage}
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </>
              )}

              {tab === 'groups' && (
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="px-2 py-1.5 flex-shrink-0">
                    <button
                      onClick={() => setShowCreateGroup(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-colors"
                      style={{ background: '#1A2D42' }}
                    >
                      <Plus className="w-3 h-3" />
                      New Group
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {groups.length === 0 ? (
                      <p className="text-[11px] text-slate-400 text-center py-4">No groups yet</p>
                    ) : (
                      groups.map(g => {
                        const isActive = activeConv?.type === 'group' && activeConv.groupId === g.id
                        return (
                          <button
                            key={g.id}
                            onClick={() => selectGroup(g.id)}
                            className="w-full text-left px-2.5 py-2 border-b hover:bg-white transition-colors"
                            style={{
                              borderColor: '#F1F5F7',
                              background: isActive ? '#fff' : undefined,
                              boxShadow: isActive ? 'inset 3px 0 0 #1A2D42' : undefined,
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded-full bg-[#2E4156] flex items-center justify-center flex-shrink-0">
                                <Users className="w-3 h-3 text-white" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <p className="text-[11px] font-semibold text-slate-700 truncate">{g.name}</p>
                                  {(g.unreadCount ?? 0) > 0 && (
                                    <span className="flex-shrink-0 min-w-[16px] h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold px-1 flex items-center justify-center">
                                      {g.unreadCount}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {g.lastMessage
                                    ? (g.lastMessageByMe ? `You: ${g.lastMessage}` : g.lastMessage)
                                    : `${g.memberCount} members`}
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Message area ── */}
            <div
              className={`flex flex-col overflow-hidden ${portalMobile && mobileView === 'contacts' ? 'hidden' : ''}`}
            >
              {!activeConv ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <MessageCircle className="w-8 h-8 opacity-30" />
                  <p className="text-xs text-center px-4">Select a conversation to start chatting</p>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-white">
                    {loadingMessages && (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                            <div className="h-8 rounded-xl bg-slate-100 animate-pulse" style={{ width: `${40 + i * 15}%` }} />
                          </div>
                        ))}
                      </div>
                    )}
                    {!loadingMessages && messages.length === 0 && (
                      <p className="text-xs text-slate-400 text-center mt-4">No messages yet. Say hello!</p>
                    )}
                    {messages.map(m => {
                      const mine = m.senderUserId === meUserId
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[78%] ${!mine && activeConv.type === 'group' ? 'flex flex-col gap-0.5' : ''}`}>
                            {!mine && activeConv.type === 'group' && m.senderName && (
                              <p className="text-[10px] text-slate-500 font-semibold px-1">{m.senderName}</p>
                            )}
                            <div
                              className="rounded-2xl px-3 py-2 text-xs leading-relaxed"
                              style={{
                                background: mine ? '#1A2D42' : '#EEF2F4',
                                color: mine ? '#fff' : '#334155',
                                borderBottomRightRadius: mine ? 4 : undefined,
                                borderBottomLeftRadius: !mine ? 4 : undefined,
                              }}
                            >
                              <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            </div>
                            <p className={`text-[9px] text-slate-400 mt-0.5 px-1 ${mine ? 'text-right' : 'text-left'}`}>
                              {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={endRef} />
                  </div>

                  {/* Input */}
                  <div className="border-t px-3 py-2 flex items-center gap-2 flex-shrink-0 bg-white" style={{ borderColor: '#E5E9EA' }}>
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                      }}
                      placeholder="Type a message..."
                      disabled={sending}
                      className="flex-1 border rounded-full px-3 py-1.5 text-xs outline-none transition-colors"
                      style={{ borderColor: '#D4D8DD' }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!draft.trim() || sending}
                      className="w-8 h-8 rounded-full text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
                      style={{ background: '#fa5e01' }}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      {!open && (
        <button
          onClick={() => { setOpen(true); if (portalMobile) setMobileView('contacts') }}
          data-tour="chat-toggle"
          className="fixed right-5 z-[70] w-13 h-13 rounded-full text-white shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          style={{ bottom: portal ? DOCK_H + 16 : 20, width: 52, height: 52, background: 'linear-gradient(135deg, #1A2D42, #2E4156)' }}
          title="Open chat"
        >
          <MessageCircle className="w-5 h-5" />
          {totalUnread > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 rounded-full px-1 text-[10px] font-bold flex items-center justify-center shadow"
              style={{ background: '#fa5e01', color: '#fff' }}
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}
    </>
  )
}
