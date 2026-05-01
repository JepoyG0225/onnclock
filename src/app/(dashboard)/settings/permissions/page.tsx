'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Shield, RotateCcw, Save, Check, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  PAGE_PERMISSIONS,
} from '@/lib/auth/permissions'
import { SettingsTabs } from '@/components/settings/SettingsTabs'

type RoleKey = UserRole | `custom:${string}`
type CustomRole = {
  id: string
  name: string
  baseRole: UserRole
  permissions: Permission[]
}

const BUILT_IN_EDITABLE_ROLES: UserRole[] = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER']

const ROLE_THEME = {
  COMPANY_ADMIN: { bg: 'bg-[#D4D8DD]', border: 'border-[#AAB7B7]', text: 'text-[#1A2D42]', badge: 'bg-[#C0C8CA] text-[#1A2D42]' },
  HR_MANAGER: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800' },
  PAYROLL_OFFICER: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  EMPLOYEE: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-700' },
  SUPER_ADMIN: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-700' },
} as const satisfies Record<UserRole, { bg: string; border: string; text: string; badge: string }>

export default function PermissionsPage() {
  const [matrix, setMatrix] = useState<Record<string, Set<Permission>> | null>(null)
  const [saving, setSaving] = useState<RoleKey | null>(null)
  const [dirty, setDirty] = useState<Set<RoleKey>>(new Set())
  const [loading, setLoading] = useState(true)
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([])
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleBase, setNewRoleBase] = useState<UserRole>('HR_MANAGER')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/role-permissions')
    if (!res.ok) { toast.error('Failed to load permissions'); setLoading(false); return }
    const data = await res.json().catch(() => ({})) as { builtIn?: Record<UserRole, Permission[]>; custom?: CustomRole[] }

    const nextMatrix: Record<string, Set<Permission>> = {}
    for (const role of BUILT_IN_EDITABLE_ROLES) {
      nextMatrix[role] = new Set(data?.builtIn?.[role] ?? ROLE_PERMISSIONS[role])
    }

    const custom = data.custom ?? []
    for (const role of custom) {
      nextMatrix[`custom:${role.id}`] = new Set(role.permissions ?? [])
    }

    setCustomRoles(custom)
    setMatrix(nextMatrix)
    setDirty(new Set())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const dynamicRoles: RoleKey[] = [
    ...BUILT_IN_EDITABLE_ROLES,
    ...customRoles.map(role => `custom:${role.id}` as RoleKey),
  ]

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

  function toggle(role: RoleKey, permission: Permission) {
    setMatrix(prev => {
      if (!prev) return prev
      const next = { ...prev }
      const set = new Set(prev[role] ?? [])
      set.has(permission) ? set.delete(permission) : set.add(permission)
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
        toast.error('Failed to save permissions')
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
    if (!newRoleName.trim()) return
    const res = await fetch('/api/settings/custom-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRoleName.trim(), baseRole: newRoleBase }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || 'Failed to create custom role')
      return
    }
    toast.success('Custom role created')
    setNewRoleName('')
    setNewRoleBase('HR_MANAGER')
    await load()
  }

  if (loading || !matrix) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Loading permissions...</p>
        </div>
      </div>
    )
  }

  const counts = Object.fromEntries(dynamicRoles.map(r => [r, matrix[r]?.size ?? 0])) as Record<string, number>

  return (
    <div className="space-y-6">
      <SettingsTabs />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#2E4156' }}>Role Permissions</h1>
          <p className="text-slate-500 text-sm mt-1">Configure built-in and custom role permissions.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty.size > 0 && <span className="text-xs text-orange-600 font-medium">{dirty.size} role(s) with unsaved changes</span>}
          <Button variant="outline" size="sm" onClick={load}><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Reload</Button>
          <Button size="sm" disabled={dirty.size === 0} onClick={saveAll} style={{ background: '#fa5e01' }}>
            <Save className="w-3.5 h-3.5 mr-1.5" />Save All Changes
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-2">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Custom role name</p>
          <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} className="border rounded px-2 py-1.5 text-sm" placeholder="e.g. Operations Lead" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Based on role</p>
          <select value={newRoleBase} onChange={e => setNewRoleBase(e.target.value as UserRole)} className="border rounded px-2 py-1.5 text-sm">
            {BUILT_IN_EDITABLE_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
        </div>
        <Button size="sm" onClick={addCustomRole}>Add Custom Role</Button>
      </div>

      <div className="flex items-start gap-3 p-3 rounded-xl bg-[#D4D8DD] border border-[#AAB7B7] text-sm text-[#1A2D42]">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>Permissions marked with <span className="font-semibold">●</span> are active for that role. Changes take effect on next login.</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {dynamicRoles.map(role => {
          const theme = ROLE_THEME[getBaseRole(role)]
          const isDirty = dirty.has(role)
          return (
            <div key={role} className={`rounded-xl border p-3 ${theme.bg} ${theme.border}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold ${theme.text}`}>{getRoleLabel(role)}</span>
                {isDirty && <span className="text-xs text-orange-500 font-medium">● unsaved</span>}
              </div>
              <p className="text-2xl font-bold" style={{ color: '#2E4156' }}>{counts[role]}</p>
              <p className="text-xs text-gray-500">permissions granted</p>
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="grid bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: `220px repeat(${dynamicRoles.length}, 1fr)` }}>
          <div className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />
            Feature / Page
          </div>

          {dynamicRoles.map(role => {
            const theme = ROLE_THEME[getBaseRole(role)]
            const isDirty = dirty.has(role)
            return (
              <div key={role} className="p-3 text-center border-l border-gray-200">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${theme.badge}`}>
                  {getRoleLabel(role)}
                </span>
                <div className="flex items-center justify-center gap-1 mt-1.5">
                  <button onClick={() => resetRole(role)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors" title="Reset to defaults">
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => saveRole(role)}
                    disabled={!isDirty || saving === role}
                    className={`text-xs px-2 py-0.5 rounded font-medium transition-all ${isDirty ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'text-gray-300 cursor-default'}`}
                  >
                    {saving === role ? '...' : isDirty ? 'Save' : <Check className="w-3 h-3 inline" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {PAGE_PERMISSIONS.map((group, gi) => (
          <div key={group.group}>
            <div className="grid items-center" style={{ gridTemplateColumns: `220px repeat(${dynamicRoles.length}, 1fr)`, background: '#f8fafc' }}>
              <div className="px-3 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100" style={{ borderLeft: '3px solid #fa5e01' }}>{group.group}</div>
              {dynamicRoles.map((_, i) => <div key={i} className="border-b border-gray-100 border-l border-l-gray-200 py-2" />)}
            </div>

            {group.pages.map((page, pi) => {
              const isLastInGroup = pi === group.pages.length - 1
              const isLastGroup = gi === PAGE_PERMISSIONS.length - 1
              const rowBorder = (!isLastInGroup || !isLastGroup) ? 'border-b border-gray-100' : ''

              return (
                <div key={page.key} className={`grid hover:bg-[#D4D8DD]/40 transition-colors ${rowBorder}`} style={{ gridTemplateColumns: `220px repeat(${dynamicRoles.length}, 1fr)` }}>
                  <div className="px-4 py-2.5 flex flex-col justify-center">
                    <span className="text-sm text-gray-700 font-medium">{page.label}</span>
                    <code className="text-xs text-gray-400 font-mono">{page.permission}</code>
                  </div>

                  {dynamicRoles.map(role => {
                    const checked = matrix[role]?.has(page.permission) ?? false
                    const theme = ROLE_THEME[getBaseRole(role)]
                    return (
                      <div key={role} className="flex items-center justify-center border-l border-gray-100 cursor-pointer" onClick={() => toggle(role, page.permission)}>
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${checked ? `${theme.border} border-opacity-0` : 'border-gray-300'}`}
                          style={checked ? { background: '#fa5e01', borderColor: '#fa5e01' } : {}}
                        >
                          {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
