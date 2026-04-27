/**
 * Shared helpers for authenticating API routes using NextAuth.
 * Replaces the old Supabase createClient() pattern.
 *
 * Also supports OnClock Desktop App Bearer tokens via the `req` parameter.
 */
import { auth } from '@/lib/auth'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'
import { verifyImpersonateToken, IMPERSONATE_COOKIE } from '@/lib/impersonate'
import { verifyDesktopToken } from '@/lib/desktop-token'

export interface AuthContext {
  userId: string
  companyId: string
  role: string
  // Original signed-in role (differs from role when SUPER_ADMIN is impersonating)
  actorRole?: string
  email: string
}

/**
 * Get the authenticated user context from the current request.
 * Returns null + a 401/403 NextResponse if not authenticated or no company.
 *
 * When `req` is provided, also accepts OnClock Desktop App Bearer tokens
 * in the `Authorization: Bearer <token>` header.
 */
export async function requireAuth(
  allowedRoles?: string[],
  req?: NextRequest
): Promise<{ ctx: AuthContext; error: null } | { ctx: null; error: NextResponse }> {
  // ── Desktop App Bearer token ──────────────────────────────────────────────
  let authHeader = ''
  if (req) {
    authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? ''
  } else {
    try {
      const hdr = await headers()
      authHeader = hdr.get('authorization') ?? hdr.get('Authorization') ?? ''
    } catch {
      authHeader = ''
    }
  }
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const payload = verifyDesktopToken(token)
    if (!payload) {
      return { ctx: null, error: NextResponse.json({ error: 'Invalid or expired desktop token' }, { status: 401 }) }
    }
    const ctx: AuthContext = {
      userId: payload.userId,
      companyId: payload.companyId,
      role: payload.role,
      actorRole: payload.role,
      email: payload.email,
    }
    const hasSuperAdminBypass = ctx.role === 'SUPER_ADMIN' || ctx.actorRole === 'SUPER_ADMIN'
    if (allowedRoles && !allowedRoles.includes(ctx.role) && !hasSuperAdminBypass) {
      return { ctx: null, error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }) }
    }
    return { ctx, error: null }
  }

  // ── NextAuth session ──────────────────────────────────────────────────────
  const session = await auth()

  if (!session?.user?.id) {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  // Check for active impersonation (SUPER_ADMIN viewing as a company)
  if (session.user.role === 'SUPER_ADMIN') {
    const jar = await cookies()
    const impToken = jar.get(IMPERSONATE_COOKIE)?.value
    if (impToken) {
      const imp = await verifyImpersonateToken(impToken)
      if (imp && imp.impersonatedBy === session.user.id) {
        const ctx: AuthContext = {
          userId: imp.userId,
          companyId: imp.companyId,
          role: imp.role,
          actorRole: 'SUPER_ADMIN',
          email: imp.email,
        }
        const hasSuperAdminBypass = ctx.role === 'SUPER_ADMIN' || ctx.actorRole === 'SUPER_ADMIN'
        if (allowedRoles && !allowedRoles.includes(ctx.role) && !hasSuperAdminBypass) {
          return {
            ctx: null,
            error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
          }
        }
        return { ctx, error: null }
      }
    }
    // SUPER_ADMIN without impersonation: bypass companyId requirement
    if (allowedRoles && !allowedRoles.includes('SUPER_ADMIN')) {
      return {
        ctx: null,
        error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
      }
    }
    return {
      ctx: {
        userId: session.user.id,
        companyId: session.user.companyId ?? '',
        role: 'SUPER_ADMIN',
        actorRole: 'SUPER_ADMIN',
        email: session.user.email,
      },
      error: null,
    }
  }

  if (!session.user.companyId) {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'No company associated with account' }, { status: 403 }),
    }
  }

  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
    }
  }

  return {
    ctx: {
      userId: session.user.id,
      companyId: session.user.companyId,
      role: session.user.role,
      actorRole: session.user.role,
      email: session.user.email,
    },
    error: null,
  }
}

/** Check if the current user has one of the required roles */
export function hasRole(ctx: AuthContext, ...roles: string[]): boolean {
  return roles.includes(ctx.role)
}

/** Returns 403 if not an admin/HR role */
export function requireAdminOrHR(ctx: AuthContext): NextResponse | null {
  if (!hasRole(ctx, 'SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  return null
}

/** Returns 403 if not SUPER_ADMIN */
export function requireSuperAdmin(ctx: AuthContext): NextResponse | null {
  if (!hasRole(ctx, 'SUPER_ADMIN') && ctx.actorRole !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  return null
}

/**
 * Resolve effective company context for API requests.
 * SUPER_ADMIN (including impersonation actor) may override via ?companyId=...
 */
export function resolveCompanyIdForRequest(ctx: AuthContext, req: NextRequest): string {
  const requestedCompanyId = new URL(req.url).searchParams.get('companyId')?.trim() ?? ''
  const canOverrideCompany = ctx.role === 'SUPER_ADMIN' || ctx.actorRole === 'SUPER_ADMIN'
  if (canOverrideCompany && requestedCompanyId) return requestedCompanyId
  return ctx.companyId
}
