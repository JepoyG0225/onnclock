'use client'

import { createContext, useContext } from 'react'
import type { Permission } from '@/lib/auth/permissions'

/**
 * Client-side carrier for the effective Permission[] resolved server-side
 * in the (dashboard) layout. Wrap the dashboard subtree in this provider
 * and any client component can read the user's permissions via
 * usePermissions() without having to thread the prop through.
 *
 * The default value is an empty array — components outside the provider
 * see "no permissions," which is the safe-by-default behavior (they
 * should be rendered inside the dashboard tree anyway).
 */
const PermissionsContext = createContext<Permission[]>([])

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: Permission[]
  children: React.ReactNode
}) {
  return (
    <PermissionsContext.Provider value={permissions}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions(): Permission[] {
  return useContext(PermissionsContext)
}
