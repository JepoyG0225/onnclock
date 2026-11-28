'use client'

import { useLiveNotifications } from '@/components/notifications-live'
import { useEffect, useRef, useState } from 'react'

type Item = { id: string; type: string; status: string; title: string; createdAt: string; href?: string }
type ReadState = { ids: string[]; through: number }
const eventName = 'portal-notifications-read'
const empty: ReadState = { ids: [], through: 0 }
function read(key: string): ReadState {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    const legacy = JSON.parse(localStorage.getItem('portal_dismissed_notifs') ?? '[]')
    const previous = value && Array.isArray(value.ids) && typeof value.through === 'number' ? value : empty
    return { ids: [...new Set([...previous.ids, ...(Array.isArray(legacy) ? legacy.filter(id => typeof id === 'string') : [])])], through: previous.through }
  } catch { return empty }
}
export function usePortalNotifications() {
  const [all, setAll] = useState<Item[]>([])
  const [scope, setScope] = useState('')
  const [seen, setSeen] = useState<ReadState>(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useLiveNotifications(true, ({ feeds }) => {
    const data = feeds[0]
    if (data?.scope) { setAll((data.items ?? []) as Item[]); setScope(data.scope); setSeen(read(`portal-notifications:${data.scope}`)) }
  })
  const locked = useRef(false)
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch('/api/notifications/portal?limit=20', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (active && data.scope) { setAll(data.items ?? []); setScope(data.scope); setSeen(read(`portal-notifications:${data.scope}`)) }
      } catch { /* Keep the last successful list during a connection interruption. */ }
    }
    void load()
    const timer = setInterval(load, 30000)
    const sync = () => { void load() }
    window.addEventListener(eventName, sync)
    window.addEventListener('storage', sync)
    return () => { active = false; clearInterval(timer); window.removeEventListener(eventName, sync); window.removeEventListener('storage', sync) }
  }, [])
  const items = all.filter(item => !seen.ids.includes(item.id) && new Date(item.createdAt).getTime() > seen.through)
  async function mark(id?: string) {
    if (!scope || locked.current) return
    locked.current = true; setBusy(true); setError('')
    const through = Date.now()
    try {
      if (!id || id.startsWith('NOTIFICATION:')) {
        const res = await fetch('/api/notifications/read', {
          method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(id ? { ids: [id.slice('NOTIFICATION:'.length)] } : {}),
        })
        if (!res.ok) throw new Error('Unable to mark notifications as read. Please try again.')
      }
      const key = `portal-notifications:${scope}`
      const previous = read(key)
      const next = { ids: [...new Set([...previous.ids, ...seen.ids, ...(id ? [id] : all.map(n => n.id))])], through: id ? Math.max(previous.through, seen.through) : through }
      // Legacy HR notifications have no server read flag; retain their read state on this device.
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* In-memory read state still works. */ }
      setSeen(next)
      window.dispatchEvent(new Event(eventName))
    } catch { setError('Unable to mark notifications as read. Please try again.') }
    finally { locked.current = false; setBusy(false) }
  }
  return { items, busy, error, markAsRead: (id: string) => mark(id), markAllAsRead: () => mark() }
}
