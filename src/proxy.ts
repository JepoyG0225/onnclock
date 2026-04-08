import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
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
    logicalPath === '/manifest.webmanifest' ||
    logicalPath === '/sw.js'

  const isLoggedIn = !!req.auth?.user
  const role = req.auth?.user?.role
  const isEmployee = role === 'EMPLOYEE'
  const hasPortalSession = req.cookies.get('portal_session')?.value === '1'

  const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/portal/login', '/api/auth', '/api/companies', '/quotation', '/api/quotation']
  const isPublic = logicalPath === '/' || publicPaths.some((p) => logicalPath.startsWith(p))
  const isPortal = logicalPath.startsWith('/portal')

  if (logicalPath === '/login' && isEmployee) {
    return NextResponse.next()
  }

  if (isApi || isAsset) return NextResponse.next()

  if (isPortal && !isPublic && (!isLoggedIn || !hasPortalSession)) {
    return NextResponse.redirect(buildRedirectUrl('/portal/login'))
  }

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(buildRedirectUrl(isPortal ? '/portal/login' : '/login'))
  }

  if (isLoggedIn && isEmployee && !isPortal && !isPublic) {
    return NextResponse.redirect(buildRedirectUrl('/portal'))
  }

  if (isLoggedIn && logicalPath.startsWith('/settings/') && role !== 'COMPANY_ADMIN') {
    return NextResponse.redirect(buildRedirectUrl('/settings'))
  }

  if (isLoggedIn && logicalPath.startsWith('/admin') && role !== 'SUPER_ADMIN') {
    return NextResponse.redirect(buildRedirectUrl('/dashboard'))
  }

  if (isLoggedIn && (logicalPath === '/login' || logicalPath === '/register')) {
    return NextResponse.redirect(buildRedirectUrl(isEmployee ? '/portal' : '/dashboard'))
  }

  if (isLoggedIn && logicalPath === '/portal/login' && hasPortalSession) {
    return NextResponse.redirect(buildRedirectUrl('/portal'))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
