'use client'
/**
 * Makes the current user's effective permission list available to client
 * components (e.g. SettingsTabs) so they can hide controls the user can't use.
 * The list is resolved on the server in the dashboard layout and passed down.
 */
import { createContext, useContext } from 'react'

const PermissionsContext = createContext<string[]>([])

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: string[]
  children: React.ReactNode
}) {
  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>
}

/** The current user's effective permissions (empty array if none/unknown). */
export function usePermissions(): string[] {
  return useContext(PermissionsContext)
}

/** Convenience check for a single permission. */
export function useHasPermission(permission: string): boolean {
  return useContext(PermissionsContext).includes(permission)
}
