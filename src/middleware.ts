import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Injects an `x-pathname` request header carrying the current URL pathname.
 *
 * Server components / layouts can then read it via `headers()` to make
 * decisions that depend on the route — most importantly, the dashboard
 * layout uses it to enforce role-permission gating (see
 * src/app/(dashboard)/layout.tsx + src/lib/auth/page-access.ts).
 *
 * We intentionally do NOT perform auth or permission checks here:
 *   • Auth runs in route handlers / layouts via NextAuth's `auth()`.
 *   • Permission gating runs in the (dashboard) layout, which already
 *     loads the session + companyId once per request.
 * Doing both here would mean an extra DB hop per navigation just to
 * duplicate work the layout already does.
 */
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-pathname', req.nextUrl.pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  // Skip Next internals, static assets, and the API routes — we only need
  // the header for app-router pages.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
