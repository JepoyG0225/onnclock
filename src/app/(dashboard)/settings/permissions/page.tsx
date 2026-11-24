'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense, useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Shield, RotateCcw, Save, Check, Info, Plus, ChevronDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  ALL_PERMISSIONS,
} from '@/lib/auth/permissions'
import { PERMISSION_MATRIX_GROUPS, permissionSelection, togglePermissionSelection } from '@/lib/auth/permission-matrix'
import { RoleOptions } from '@/components/auth/RoleOptions'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { AppSpinner } from '@/components/ui/AppSpinner'

type RoleKey = UserRole | `custom:${string}`
type CustomRole = {
  id: string
  name: string
  baseRole: UserRole
  permissions: Permission[]
}

const BUILT_IN_EDITABLE_ROLES: UserRole[] = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER']

const ROLE_THEME = {
  COMPANY_ADMIN: { bg: 'bg-[#dce5f7]', border: 'border-[#AAB7B7]', text: 'text-primary', badge: 'bg-[#c4d9ff] text-primary' },
  HR_MANAGER: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800' },
  PAYROLL_OFFICER: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  EMPLOYEE: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-700' },
  SUPER_ADMIN: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-700' },
} as const satisfies Record<UserRole, { bg: string; border: string; text: string; badge: string }>

export default function PermissionsPage() {
  return <Suspense fallback={<div role="status" className="flex justify-center py-16"><AppSpinner size="md" /></div>}><PermissionsContent /></Suspense>
}

function PermissionsContent() {
  const requestedRole = useSearchParams().get('role')
  const appliedRole = useRef<string | null>(null)
  const [matrix, setMatrix] = useState<Record<string, Set<Permission>> | null>(null)
  const [saving, setSaving] = useState<RoleKey | null>(null)
  const [dirty, setDirty] = useState<Set<RoleKey>>(new Set())
  const [loading, setLoading] = useState(true)
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([])
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleOpen, setNewRoleOpen] = useState(false)
  const [creatingRole, setCreatingRole] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedRole, setSelectedRole] = useState<RoleKey>('COMPANY_ADMIN')

  // Role editors must see all assignable access, even when their own role lacks it.
  const pagePermissionGroups = PERMISSION_MATRIX_GROUPS

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/role-permissions')
    if (!res.ok) { toast.error('Failed to load permissions'); setLoading(false); return }
    const data = await res.json().catch(() => ({})) as { builtIn?: Record<UserRole, Permission[]>; custom?: CustomRole[] }

    const nextMatrix: Record<string, Set<Permission>> = {}
    for (const role of BUILT_IN_EDITABLE_ROLES) {
      nextMatrix[role] = new Set((data?.builtIn?.[role] ?? ROLE_PERMISSIONS[role]).filter(p => ALL_PERMISSIONS.includes(p)))
    }

    const custom = data.custom ?? []
    for (const role of custom) {
      nextMatrix[`custom:${role.id}`] = new Set((role.permissions ?? []).filter(p => ALL_PERMISSIONS.includes(p)))
    }

    setCustomRoles(custom)
    setMatrix(nextMatrix)
    setDirty(new Set())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const dynamicRoles: RoleKey[] = useMemo(() => [
    ...BUILT_IN_EDITABLE_ROLES,
    ...customRoles.map(role => `custom:${role.id}` as RoleKey),
  ], [customRoles])

  useEffect(() => {
    if (loading || !matrix || !requestedRole || appliedRole.current === requestedRole) return
    appliedRole.current = requestedRole
    if (dynamicRoles.includes(requestedRole as RoleKey)) setSelectedRole(requestedRole as RoleKey)
    else toast.error('This role is no longer available. Select a current role below.')
  }, [loading, matrix, requestedRole, dynamicRoles])

  useEffect(() => {
    if (dynamicRoles.includes(selectedRole)) return
    setSelectedRole(dynamicRoles[0] ?? 'COMPANY_ADMIN')
  }, [dynamicRoles, selectedRole])

  function getRoleLabel(role: RoleKey) {
    if (role.startsWith('custom:')) {
      return customRoles.find(item => `custom:${item.id}` === role)?.name ?? 'Custom role'
    }
    return ROLE_LABELS[role as UserRole]
  }

  function getBaseRole(role: RoleKey): UserRole {
    if (role.startsWith('custom:')) {
      return customRoles.find(item => `custom:${item.id}` === role)?.baseRole ?? 'HR_MANAGER'
    }
    return role as UserRole
  }

  function toggle(role: RoleKey, permissions: Permission[]) {
    setMatrix(prev => {
      if (!prev) return prev
      const next = { ...prev }
      const set = togglePermissionSelection(prev[role] ?? new Set(), permissions)
      next[role] = set
      return next
    })
    setDirty(prev => new Set([...prev, role]))
  }

  async function saveRole(role: RoleKey) {
    if (!matrix) return
    setSaving(role)
    try {
      const res = await fetch('/api/settings/role-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, permissions: [...(matrix[role] ?? [])] }),
      })
      if (res.ok) {
        toast.success(`${getRoleLabel(role)} permissions saved`)
        setDirty(prev => { const s = new Set(prev); s.delete(role); return s })
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to save permissions')
      }
    } finally {
      setSaving(null)
    }
  }

  async function resetRole(role: RoleKey) {
    const res = await fetch(`/api/settings/role-permissions?role=${encodeURIComponent(role)}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`${getRoleLabel(role)} reset to defaults`)
      load()
    } else {
      toast.error('Failed to reset')
    }
  }

  async function saveAll() {
    for (const role of dynamicRoles) {
      if (dirty.has(role)) await saveRole(role)
    }
  }

  async function addCustomRole() {
    if (!newRoleName.trim() || creatingRole) return
    setCreatingRole(true)
    try {
    const res = await fetch('/api/settings/custom-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRoleName.trim() }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || 'Failed to create custom role')
      return
    }
    toast.success('Custom role created')
    setNewRoleName('')
    const data = await res.json().catch(() => ({}))
    if (data.id) {
      const role = { id: data.id, name: data.name ?? newRoleName.trim(), baseRole: data.baseRole ?? 'HR_MANAGER', permissions: data.permissions ?? [] } as CustomRole
      setCustomRoles(prev => [...prev, role])
      setMatrix(prev => ({ ...prev, [`custom:${role.id}`]: new Set(role.permissions) }))
      setSelectedRole(`custom:${role.id}`)
    } else { await load() }
    setNewRoleOpen(false)
    } catch { toast.error('Failed to create custom role. Please retry.') }
    finally { setCreatingRole(false) }
  }

  if (loading || !matrix) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <AppSpinner size="md" className="mx-auto" />
          <p className="text-sm text-gray-500">Loading permissions...</p>
        </div>
      </div>
    )
  }

  const selected = selectedRole

  return (
    <div className="space-y-6">
      <SettingsTabs />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--brand-primary)' }}>Role Permissions</h1>
          <p className="text-slate-500 text-sm mt-1">Configure built-in and custom role permissions. Entries with the same permission code are linked and switch together. View access does not grant editing or approval. Changes apply to everyone assigned to the selected role.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty.size > 0 && <span className="text-xs text-orange-600 font-medium">{dirty.size} role(s) with unsaved changes</span>}
          <Button variant="outline" size="sm" onClick={load}><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Reload</Button>
          <Button size="sm" disabled={dirty.size === 0} onClick={saveAll} style={{ background: 'var(--brand-highlight)' }}>
            <Save className="w-3.5 h-3.5 mr-1.5" />Save All Changes
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:gap-3">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor="selected-role" className="mb-1 block text-xs font-medium text-slate-500">Selected role</label>
          <select id="selected-role" value={selected} onChange={e => setSelectedRole(e.target.value as RoleKey)} className="h-9 w-full rounded-md border px-3 text-sm">
            <RoleOptions defaults={BUILT_IN_EDITABLE_ROLES} custom={customRoles} />
          </select>
        </div>
        <Button onClick={() => setNewRoleOpen(true)} className="shrink-0 px-3"><Plus className="h-4 w-4" />Add New Role</Button>
        <Button variant="outline" onClick={() => resetRole(selected)} className="ml-auto shrink-0"><RotateCcw className="h-4 w-4" />Reset to Defaults</Button>
      </div>

      <Dialog open={newRoleOpen} onOpenChange={open => { if (!creatingRole) setNewRoleOpen(open) }}>
        <DialogContent>
          <form onSubmit={e => { e.preventDefault(); void addCustomRole() }}>
            <DialogHeader><DialogTitle>Add New Role</DialogTitle><DialogDescription>New custom roles start with no permissions. Choose their access after creating the role.</DialogDescription></DialogHeader>
            <label htmlFor="new-role-name" className="mb-1 block text-sm font-medium">Role name</label>
            <input id="new-role-name" autoFocus required value={newRoleName} onChange={e => setNewRoleName(e.target.value)} disabled={creatingRole} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g. Operations Lead" />
            <DialogFooter className="mt-5"><Button type="button" variant="outline" disabled={creatingRole} onClick={() => setNewRoleOpen(false)}>Cancel</Button><Button type="submit" disabled={creatingRole || !newRoleName.trim()}>{creatingRole ? 'Creating...' : 'Create Role'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-primary">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Read grants viewing access. Write groups editing, approval, deletion and management actions for that module. A partial checkbox means only some actions are currently enabled. A dash means separate access is unavailable. Shared permissions switch together.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setExpandedGroups(new Set(pagePermissionGroups.map(group => group.group)))}>Expand all</Button>
          <Button size="sm" variant="outline" onClick={() => setExpandedGroups(new Set())}>Collapse all</Button>
        </div>

      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] border-b bg-primary text-white sm:grid-cols-[minmax(0,1fr)_120px_120px]">
          <div className="flex items-center gap-2 p-3 text-xs font-semibold"><Shield className="h-4 w-4" />Module</div>
          <div className="p-3 text-center text-xs font-semibold">Read</div>
          <div className="p-3 text-center text-xs font-semibold">Write</div>
        </div>
        {pagePermissionGroups.map((group, index) => {
          const expanded = expandedGroups.has(group.group)
          const permissions = [...new Set(group.rows.flatMap(row => [...row.read, ...row.write]))]
          const enabled = permissions.filter(permission => matrix[selected]?.has(permission)).length
          return <section key={group.group} className="border-b last:border-b-0">
            <button type="button" aria-expanded={expanded} aria-controls={`permission-group-${index}`} onClick={() => setExpandedGroups(prev => { const next = new Set(prev); if (next.has(group.group)) next.delete(group.group); else next.add(group.group); return next })} className="flex w-full items-center gap-3 bg-blue-50/60 px-4 py-3 text-left text-primary hover:bg-blue-100/70">
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
              <span className="flex-1 text-sm font-semibold">{group.group}</span>
              <span className="text-xs tabular-nums">{enabled}/{permissions.length} enabled</span>
            </button>
            <div id={`permission-group-${index}`} hidden={!expanded}>
              {group.rows.map(row => <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_64px_64px] border-t hover:bg-blue-50/30 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
                <div className="min-w-0 px-4 py-3" title={row.actions.join('; ')}><p className="text-sm font-medium text-slate-700">{row.label}</p></div>
                {(['read', 'write'] as const).map(column => {
                  const permissions = row[column]
                  const state = permissionSelection(matrix[selected] ?? new Set(), permissions)
                  return <div key={column} className="flex items-center justify-center border-l">
                    {permissions.length > 0 ? <input type="checkbox" checked={state.checked} ref={element => { if (element) element.indeterminate = state.partial }} aria-checked={state.partial ? 'mixed' : state.checked} onChange={() => toggle(selected, permissions)} aria-label={`${column === 'read' ? 'Read' : 'Write'}: ${row.label}`} title={state.partial ? 'Some actions enabled. Select to enable all.' : undefined} className="h-5 w-5 cursor-pointer rounded accent-[#ff5900] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600" /> : <span aria-label="Not separately available" className="text-slate-300">&mdash;</span>}
                  </div>
                })}
              </div>)}
            </div>
          </section>
        })}
      </div>
    </div>
  )
}
