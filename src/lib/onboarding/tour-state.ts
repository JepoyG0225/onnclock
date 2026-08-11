/**
 * Client helpers for guided-tour progress.
 *
 * Progress is stored against the USER via /api/tours, not just the browser.
 * localStorage used to be the only store, which made "show once" mean "once
 * per browser" — the same person saw every tour again on a second device, in
 * a private window, or after clearing site data.
 *
 * localStorage is still written as a fast local cache so the current tab
 * reacts instantly and behaviour degrades sensibly when the request fails.
 */

export type RemoteTourState = { seen: Record<string, boolean>; off: boolean }

const EMPTY: RemoteTourState = { seen: {}, off: false }

/** Fetch the user's tour progress. Never throws — falls back to empty. */
export async function fetchTourState(): Promise<RemoteTourState> {
  try {
    const res = await fetch('/api/tours')
    if (!res.ok) return EMPTY
    const data = await res.json()
    return { seen: data?.seen ?? {}, off: Boolean(data?.off) }
  } catch {
    return EMPTY
  }
}

/** Mark a tour seen for this user (and optionally opt out of all tours). */
export async function markTourSeen(key: string, off = false): Promise<void> {
  try {
    await fetch('/api/tours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(off ? { key, off: true } : { key }),
    })
  } catch {
    // Non-fatal — the caller also keeps a localStorage copy.
  }
}
