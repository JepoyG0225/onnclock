/**
 * Shared helpers for authenticating API routes using NextAuth.
 * Replaces the old Supabase createClient() pattern.
 */
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export interface AuthContext {
  userId: string
  companyId: string
  role: string
  email: string
}

/**
 * Get the authenticated user context from the current request.
 * Returns null + a 401/403 NextResponse if not authenticated or no company.
 */
export async function requireAuth(
  allowedRoles?: string[]
): Promise<{ ctx: AuthContext; error: null } | { ctx: null; error: NextResponse }> {
  const session = await auth()

  if (!session?.user?.id) {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
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
  if (!hasRole(ctx, 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  return null
}
