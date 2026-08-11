'use client'
/**
 * Client-side page-access guard. Given the current user's effective permissions,
 * it blocks rendering of any dashboard route whose required permission (see
 * ROUTE_PERMISSIONS) the user does not hold, showing an "access denied" screen
 * instead. Unrestricted routes render normally (fail-open). This complements the
 * sidebar filtering so users can't reach a page by typing its URL.
 */
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { canAccessRoute } from '@/lib/auth/permissions'

export function RouteGuard({
  permissions,
  children,
}: {
  permissions: string[]
  children: React.ReactNode
}) {
  const pathname = usePathname()

  if (pathname && !canAccessRoute(pathname, permissions)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
            <ShieldAlert className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">You don&apos;t have access to this page</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            Your role doesn&apos;t include permission for this section. If you believe this is a
            mistake, ask your company administrator to grant access under Settings → Role Permissions.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#032b63] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
