'use client'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

type Notice = { id: string; title: string; employee?: string; isRead?: boolean }
type Feed = { items?: Notice[]; scope?: string }
type Update = { scope: string; feeds: Feed[] }
let audio: HTMLAudioElement | undefined
export function enableNotificationSound() {
  audio ??= new Audio('/sounds/request-notification.mp3')
  audio.volume = 0.7
  audio.currentTime = 0
  return audio.play()
}
const connections = new Map<boolean, { callbacks: Set<(update: Update) => void>; source: EventSource; latest?: Update }>()
function subscribe(portal: boolean, callback: (update: Update) => void) {
  let connection = connections.get(portal)
  if (!connection) {
    let scope = ''
    let seen = new Set<string>()
    let initial = true
    const source = new EventSource(`/api/notifications/live${portal ? '?portal=1' : ''}`)
    connection = { callbacks: new Set(), source }
    connections.set(portal, connection)
    const shared = connection
    source.onmessage = event => {
      try {
        const update: Update = JSON.parse(event.data)
        if (scope !== update.scope) { scope = update.scope; seen = new Set(); initial = true }
        const notices = update.feeds.flatMap((f, index) => (f.items ?? []).map(n => ({ ...n, key: `${index}:${n.id}` })))
        const fresh = notices.filter(n => !seen.has(n.key) && n.isRead !== true)
        notices.forEach(n => seen.add(n.key))
        shared.latest = update
        shared.callbacks.forEach(cb => cb(update))
        if (!initial && fresh.length) {
          // One sound/toast per batch, shared across open tabs when Web Locks is available.
          const announce = async () => {
            const key = `notification-alert:${scope}`
            const fingerprint = fresh.map(n => n.key).sort().join('|')
            try { if (localStorage.getItem(key) === fingerprint) return; localStorage.setItem(key, fingerprint) } catch { /* private browsing */ }
            toast.info(fresh.length === 1 ? fresh[0].title : `${fresh.length} new notifications`, { description: fresh.length === 1 ? fresh[0].employee : undefined })
            try { await enableNotificationSound() } catch { /* Browser requires a user gesture to enable sound. */ }
          }
          if (navigator.locks) void navigator.locks.request(`notification-alert:${scope}`, announce)
          else void announce()
        }
        initial = false
      } catch { /* Ignore malformed/incomplete stream events. */ }
    }
  }
  connection.callbacks.add(callback)
  if (connection.latest) callback(connection.latest)
  const current = connection
  return () => { current.callbacks.delete(callback); if (!current.callbacks.size) { current.source.close(); connections.delete(portal) } }
}
export function useLiveNotifications(portal: boolean, onUpdate: (update: Update) => void) {
  const callback = useRef(onUpdate)
  callback.current = onUpdate
  useEffect(() => subscribe(portal, update => callback.current(update)), [portal])
}
