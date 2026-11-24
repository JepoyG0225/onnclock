import { mutationPermissions } from '@/lib/auth/mutation-permissions'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { verifyDesktopToken } from '@/lib/desktop-token'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export default auth(async (req) => {
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').toLowerCase()
  const configuredPublicHost = (process.env.PORTAL_BASE_DOMAIN || '').toLowerCase()
  const publicHost =
    process.env.NODE_ENV === 'production'
      ? (configuredPublicHost || host)
      : host
  const buildRedirectUrl = (pathname: string, search = '') => {
    const url = req.nextUrl.clone()
    url.pathname = pathname
    url.search = search
    if (publicHost) {
      if (process.env.NODE_ENV === 'production') url.protocol = 'https'
      url.host = publicHost
    }
    return url
  }
  const isVercelHost = host.includes('.vercel.app')
  const isWwwHost = configuredPublicHost && host === `www.${configuredPublicHost}`
  if (isWwwHost) {
    const canonical = buildRedirectUrl(req.nextUrl.pathname)
    canonical.search = req.nextUrl.search
    return NextResponse.redirect(canonical, 308)
  }

  // Only enforce canonical host when explicitly configured.
  if (isVercelHost && configuredPublicHost) {
    const canonical = buildRedirectUrl(req.nextUrl.pathname)
    canonical.search = req.nextUrl.search
    return NextResponse.redirect(canonical, 308)
  }

  const logicalPath = req.nextUrl.pathname

  const isApi = logicalPath.startsWith('/api')
  const isAsset =
    logicalPath.startsWith('/_next') ||
    logicalPath.startsWith('/favicon') ||
    logicalPath.startsWith('/face-api/') ||
    logicalPath.startsWith('/audio/kiosk/') ||
    logicalPath === '/manifest.webmanifest' ||
    logicalPath === '/sw.js' ||
    logicalPath === '/portal-offline.html' ||
    logicalPath === '/portal-offline.js'

  const isLoggedIn = !!req.auth?.user
  const role = req.auth?.user?.role
  const impersonateToken = req.cookies.get('__impersonate')?.value
  const impersonatePayload =
    role === 'SUPER_ADMIN' && impersonateToken
      ? decodeJwtPayload(impersonateToken)
      : null
  const impersonatedRole =
    typeof impersonatePayload?.role === 'string' ? impersonatePayload.role : null
  const isPreviewMode = role === 'SUPER_ADMIN' && !!impersonatedRole
  const effectiveRole = impersonatedRole ?? role
  const isEmployee = effectiveRole === 'EMPLOYEE'
  const hasPortalSession = req.cookies.get('portal_session')?.value === '1'

  const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/portal/login', '/admin/login', '/download', '/api/auth', '/api/companies', '/quotation', '/api/quotation', '/apply', '/api/public', '/desktop', '/office-kiosk', '/api/desktop-app/download']
  const isPublic = logicalPath === '/' || publicPaths.some((p) => logicalPath.startsWith(p))
  const isPortal = logicalPath.startsWith('/portal')

  if (logicalPath === '/login' && isEmployee) {
    return NextResponse.next()
  }

  if (isApi) {
    const method = req.method.toUpperCase()
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method)
    const isStopPreview = logicalPath === '/api/admin/impersonate' && method === 'DELETE'
    const isAuthApi = logicalPath.startsWith('/api/auth')
    if (isPreviewMode && isWrite && !isStopPreview && !isAuthApi) {
      return NextResponse.json({ error: 'Preview mode is read-only' }, { status: 403 })
    }
    const required = mutationPermissions(logicalPath, method)
    if (required) {
      const bearer = req.headers.get('authorization')
      const desktop = bearer?.startsWith('Bearer ') ? verifyDesktopToken(bearer.slice(7)) : null
      const actor = desktop ?? req.auth?.user
      // Invalid bearer tokens must not inherit a cookie session's privileges.
      if (bearer?.startsWith('Bearer ') && !desktop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (actor.role !== 'SUPER_ADMIN') {
        try {
          const userId = desktop ? desktop.userId : req.auth!.user.id
          const permissions = await getEffectivePermissions(actor.role, actor.companyId, userId)
          if (!required.some(permission => permissions.includes(permission))) return NextResponse.json({ error: 'View-only access. You do not have permission to perform this action.' }, { status: 403 })
        } catch {
          return NextResponse.json({ error: 'Unable to verify permissions. Please try again.' }, { status: 503 })
        }
      }
    }
    return NextResponse.next()
  }
  if (isAsset) return NextResponse.next()

  if (isPortal && !isPublic && (!isLoggedIn || !hasPortalSession)) {
    return NextResponse.redirect(buildRedirectUrl('/portal/login'))
  }

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(buildRedirectUrl(isPortal ? '/portal/login' : '/login'))
  }

  // Don't redirect SUPER_ADMIN to portal even if the impersonated user is EMPLOYEE
  if (isLoggedIn && isEmployee && !isPortal && !isPublic && role !== 'SUPER_ADMIN') {
    return NextResponse.redirect(buildRedirectUrl('/portal'))
  }

  // Settings access is enforced by the dashboard's effective-permission
  // guard. Role-only redirects here conflict with custom roles and the
  // universally accessible /settings/profile fallback.

  if (isLoggedIn && logicalPath.startsWith('/admin') && logicalPath !== '/admin/login' && effectiveRole !== 'SUPER_ADMIN') {
    return NextResponse.redirect(buildRedirectUrl('/dashboard'))
  }

  if (isLoggedIn && logicalPath === '/admin/login' && effectiveRole === 'SUPER_ADMIN') {
    return NextResponse.redirect(buildRedirectUrl('/admin/companies'))
  }

  if (isLoggedIn && (logicalPath === '/login' || logicalPath === '/register')) {
    return NextResponse.redirect(buildRedirectUrl(isEmployee ? '/portal' : effectiveRole === 'SUPER_ADMIN' ? '/admin/companies' : '/dashboard'))
  }

  if (isLoggedIn && logicalPath === '/portal/login' && hasPortalSession) {
    return NextResponse.redirect(buildRedirectUrl('/portal'))
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-pathname', logicalPath)
  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
