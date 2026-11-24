'use client'
import { useEffect, useState } from 'react'
import { Sparkles, ScanFace } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CURRENT_UPDATE_ID, type ProductRelease } from '@/lib/product-updates'

// Share the in-flight claim across React Strict Mode remounts without losing its result.
const claims = new Map<string, Promise<ProductRelease | null>>()
const shown = new Set<string>()
function claim(key: string) {
  let pending = claims.get(key)
  if (!pending) {
    pending = fetch('/api/product-updates', { method: 'POST', cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Update notice unavailable.')
      return (await response.json()).release as ProductRelease | null
    }).catch(() => { claims.delete(key); return null })
    claims.set(key, pending)
  }
  return pending
}
export default function ProductUpdatesPopup({ userId }: { userId: string }) {
  const [page, setPage] = useState(0)
  const [release, setRelease] = useState<ProductRelease | null>(null)
  useEffect(() => {
    const key = `${userId}:${CURRENT_UPDATE_ID}`
    if (shown.has(key)) return
    let cancelled = false, pending = false
    const hasOverlay = () => Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"], .fixed.inset-0')).some(element => element.getClientRects().length > 0)
    const timer = setInterval(async () => {
      if (cancelled || pending || document.visibilityState !== 'visible') return
      // Let tours, KYB, subscription notices and company announcements finish first.
      if (hasOverlay()) return
      pending = true
      const next = await claim(key)
      if (cancelled) return
      if (next && Date.parse(next.expiresAt) <= Date.now()) { clearInterval(timer); return }
      if (next && (hasOverlay() || document.visibilityState !== 'visible')) { pending = false; return }
      clearInterval(timer)
      if (next && !shown.has(key)) { shown.add(key); setRelease(next) }
    }, 1500)
    return () => { cancelled = true; clearInterval(timer) }
  }, [userId])
  useEffect(() => {
    if (!release) return
    const timer = setTimeout(() => setRelease(null), Math.max(0, Date.parse(release.expiresAt) - Date.now()))
    return () => clearTimeout(timer)
  }, [release])
  // Do not mount an inactive Dialog: its scroll effect could unlock another popup.
  if (!release) return null
  const pages: ProductRelease['updates'][] = []
  for (let start = 0; start < release.updates.length; start += 4) pages.push(release.updates.slice(start, start + 4))
  if (release.spotlight) pages.push([release.spotlight])
  const spotlightPage = !!release.spotlight && page === pages.length - 1
  return <Dialog open onOpenChange={open => { if (!open) setRelease(null) }}>
    <DialogContent className="max-w-xl mx-4 max-h-[90dvh] overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-labelledby="product-updates-title">
        <DialogHeader><div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2 text-blue-600"><Sparkles className="h-5 w-5" /></span><div><DialogTitle><span id="product-updates-title">{release.title}</span></DialogTitle><p className="text-xs text-gray-500 mt-1">{release.date}</p></div></div></DialogHeader>
        <div className="px-6 pb-2 space-y-4">{spotlightPage && <div className="flex justify-center rounded-2xl bg-blue-50 py-7 text-blue-600"><ScanFace className="h-20 w-20" aria-hidden="true" /></div>}{(pages[page] ?? []).map(update => <article key={update.title} className="rounded-xl border border-gray-100 p-4">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-sm">{update.title}</h3><span className="rounded-full bg-lime-100 px-2 py-0.5 text-[10px] font-bold text-lime-800">{update.label}</span>{update.plan && <span className="text-[10px] text-gray-500">{update.plan}</span>}</div>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">{update.description}</p>
        </article>)}</div>
        <div className="p-6 text-center"><div className="flex items-center justify-center gap-3">{page > 0 && <Button variant="outline" onClick={() => setPage(p => p - 1)}>Back</Button>}{page < pages.length - 1 ? <Button onClick={() => setPage(p => p + 1)}>Next</Button> : <Button onClick={() => setRelease(null)}>Got it</Button>}</div>{pages.length > 1 && <p className="mt-3 text-xs text-gray-500">Page {page + 1} of {pages.length}</p>}<p className="text-xs text-gray-400 mt-3">You’ll only see this announcement once.</p></div>
      </div>
    </DialogContent>
  </Dialog>
}
