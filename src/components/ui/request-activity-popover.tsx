'use client'

import { useState, useRef, useEffect } from 'react'
import { Activity, X, Loader2 } from 'lucide-react'
import { RequestActivityFeed, type RequestActivityEvent } from '@/components/ui/request-activity-feed'

/**
 * Self-contained "Activity" button + popover for any request row in a
 * list page. Clicking the button opens a popover anchored to the row,
 * lazy-fetches the activity feed from /api/request-activity, and
 * renders it with the shared <RequestActivityFeed>.
 *
 * Caches each fetch result so re-opening the same popover is instant.
 * Closes on outside click or Escape.
 *
 * Usage in any list page (no setup beyond importing):
 *
 *   <RequestActivityPopover type="LEAVE" id={request.id} />
 */
export interface RequestActivityPopoverProps {
  type: 'LEAVE' | 'OVERTIME' | 'CASH_ADVANCE' | 'BUDGET' | 'TIME_CORRECTION' | 'PAYROLL'
  id: string
  /** Optional label override for the trigger button. Defaults to "Activity". */
  label?: string
}

const cache = new Map<string, RequestActivityEvent[]>()

export function RequestActivityPopover({ type, id, label = 'Activity' }: RequestActivityPopoverProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [events, setEvents] = useState<RequestActivityEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const cacheKey = `${type}:${id}`

  // Fetch on open (with cache).
  useEffect(() => {
    if (!open) return
    const cached = cache.get(cacheKey)
    if (cached) {
      setEvents(cached)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/request-activity?type=${type}&id=${id}`)
      .then(async r => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}))
          throw new Error(data?.error || 'Failed to load activity')
        }
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        cache.set(cacheKey, data.events ?? [])
        setEvents(data.events ?? [])
      })
      .catch(err => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, type, id, cacheKey])

  // Outside-click + Escape to close.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 transition-colors"
      >
        <Activity className="w-3.5 h-3.5" />
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Request activity"
          className="absolute right-0 z-30 mt-1.5 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">Activity</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto px-4 py-4">
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading activity…
              </div>
            )}
            {error && (
              <p className="text-xs text-rose-600">{error}</p>
            )}
            {!loading && !error && events && (
              <RequestActivityFeed events={events} compact />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
