"use client"
import type { ReactNode } from 'react'
import type { Permission } from '@/lib/auth/permissions'
import { usePermissions } from './PermissionsProvider'
export function PermissionGate({ permission, children }: { permission: Permission; children: ReactNode }) {
  const permissions = usePermissions()
  return (permissions.includes(permission) || (permission === 'tasks:write' && permissions.includes('tasks:manage'))) ? children : null
}
