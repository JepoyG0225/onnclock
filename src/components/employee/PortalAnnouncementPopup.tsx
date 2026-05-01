'use client'

import { useEffect, useMemo, useState } from 'react'

type Announcement = {
  id: string
  title: string
  content: string
  publishedAt: string
  expiresAt: string | null
  isActive: boolean
}

type PortalAnnouncementPopupProps = {
  userId: string
  companyId: string
}

function storageKey(companyId: string, userId: string) {
  return `portal_read_announcements:${companyId}:${userId}`
}

function getReadIds(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function setReadIds(key: string, ids: string[]) {
  localStorage.setItem(key, JSON.stringify(ids))
}

export function PortalAnnouncementPopup({ userId, companyId }: PortalAnnouncementPopupProps) {
  const key = useMemo(() => storageKey(companyId, userId), [companyId, userId])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [readIds, setReadIdsState] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  const current = useMemo(
    () =>
      announcements.find((item) => {
        if (readIds.includes(item.id)) return false
        if (!item.isActive) return false
        if (item.expiresAt && new Date(item.expiresAt) < new Date()) return false
        return true
      }) ?? null,
    [announcements, readIds]
  )

  useEffect(() => {
    setReadIdsState(getReadIds(key))
  }, [key])

  useEffect(() => {
    let active = true
    async function loadAnnouncements() {
      try {
        const res = await fetch('/api/announcements')
        if (!res.ok) return
        const data = await res.json()
        const list = Array.isArray(data?.announcements) ? data.announcements : []
        if (!active) return
        setAnnouncements(list)
      } catch {
        // ignore
      }
    }
    loadAnnouncements()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setOpen(!!current)
  }, [current])

  function handleMarkAsRead() {
    if (!current) return
    const next = Array.from(new Set([...readIds, current.id]))
    setReadIds(key, next)
    setReadIdsState(next)
    setOpen(false)
  }

  if (!current || !open) return null

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#fa5e01]">Company Announcement</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">{current.title}</h2>
          <p className="text-xs text-slate-400 mt-1">
            Posted {new Date(current.publishedAt).toLocaleString()}
          </p>
        </div>

        <div className="px-6 py-5 max-h-[55vh] overflow-auto">
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{current.content}</p>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={handleMarkAsRead}
            className="rounded-xl bg-[#2E4156] hover:bg-[#1A2D42] text-white text-sm font-bold px-5 py-2.5 transition-colors"
          >
            Mark as Read
          </button>
        </div>
      </div>
    </div>
  )
}
