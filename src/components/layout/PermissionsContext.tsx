"use client"
export { PermissionsProvider, usePermissions } from '@/components/auth/PermissionsProvider'
import { usePermissions } from '@/components/auth/PermissionsProvider'
export function useHasPermission(permission: string): boolean {
  return (usePermissions() as string[]).includes(permission)
}
