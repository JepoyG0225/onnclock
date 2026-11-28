import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { GET as adminNotifications } from '../admin/route'
import { GET as personalNotifications } from '../route'
import { GET as portalNotifications } from '../portal/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Authenticated SSE; use the same audience-filtered feeds as the bell.
// Bounded connections reconnect automatically; no process-local event bus.
export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const portal = req.nextUrl.searchParams.get('portal') === '1'
  const feedRequest = new NextRequest(new URL('/api/notifications?limit=50', req.url), { headers: req.headers })
  let stopped = false
  let wake: (() => void) | undefined
  const stop = () => { stopped = true; wake?.() }
  req.signal.addEventListener('abort', stop)
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (value: string) => { if (!stopped) controller.enqueue(encoder.encode(value)) }
      const until = Date.now() + 45000
      let previous = ''
      try {
        send('retry: 2000\n\n')
        while (!stopped && Date.now() < until) {
          const auth = await requireAuth()
          if (auth.error || auth.ctx.companyId !== ctx.companyId || auth.ctx.userId !== ctx.userId) break
          const responses = portal ? [await portalNotifications(feedRequest)] : await Promise.all([adminNotifications(feedRequest), personalNotifications(feedRequest)])
          if (responses.some(r => !r.ok)) break
          const feeds = await Promise.all(responses.map(r => r.json()))
          if (!feeds.some(f => f.degraded)) {
            const data = JSON.stringify({ scope: `${ctx.companyId}:${ctx.userId}`, feeds })
            if (data !== previous) { send(`data: ${data}\n\n`); previous = data }
            else send(': heartbeat\n\n')
          }
          await new Promise<void>(resolve => { const timer = setTimeout(done, 3000); function done() { clearTimeout(timer); wake = undefined; resolve() } wake = done; if (stopped) done() })
        }
      } catch { /* EventSource retries; retain the last successful client state. */ }
      finally { req.signal.removeEventListener('abort', stop); if (!stopped) controller.close() }
    },
    cancel: stop,
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'private, no-cache, no-store, no-transform', 'X-Accel-Buffering': 'no' } })
}
