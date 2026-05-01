'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Shield, RotateCcw, Save, Check, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  PAGE_PERMISSIONS,
} from '@/lib/auth/permissions'
import { SettingsTabs } from '@/components/settings/SettingsTabs'

// Roles that can be edited
const EDITABLE_ROLES: UserRole[] = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER']

const ROLE_THEME = {
  COMPANY_ADMIN:   { bg: 'bg-[#D4D8DD]',   border: 'border-[#AAB7B7]',   text: 'text-[#1A2D42]',   badge: 'bg-[#C0C8CA] text-[#1A2D42]' },
  HR_MANAGER:      { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  badge: 'bg-green-100 text-green-800' },
  PAYROLL_OFFICER: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-800' },
  EMPLOYEE:        { bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-700',   badge: 'bg-gray-100 text-gray-700' },
  SUPER_ADMIN:     { bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-700',  badge: 'bg-slate-100 text-slate-700' },
} as const satisfies Record<UserRole, { bg: string; border: string; text: string; badge: string }>

type PermissionMatrix = Record<UserRole, Set<Permission>>

export default function PermissionsPage() {
  const [matrix,   setMatrix]   = useState<PermissionMatrix | null>(null)
  const [saving,   setSaving]   = useState<UserRole | null>(null)
  const [dirty,    setDirty]    = useState<Set<UserRole>>(new Set())
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/settings/role-permissions')
    if (!res.ok) { toast.error('Failed to load permissions'); setLoading(false); return }
    const data = await res.json() as Record<UserRole, Permission[]>
    const m: PermissionMatrix = {} as PermissionMatrix
    for (const role of EDITABLE_ROLES) {
      m[role] = new Set(data[role] ?? ROLE_PERMISSIONS[role])
    }
    setMatrix(m)
    setDirty(new Set())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function toggle(role: UserRole, permission: Permission) {
    setMatrix(prev => {
      if (!prev) return prev
      const next = { ...prev }
      const set  = new Set(prev[role])
      set.has(permission) ? set.delete(permission) : set.add(permission)
      next[role] = set
      return next
    })
    setDirty(prev => new Set([...prev, role]))
  }

  async function saveRole(role: UserRole) {
    if (!matrix) return
    setSaving(role)
    try {
      const res = await fetch('/api/settings/role-permissions', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role, permissions: [...matrix[role]] }),
      })
      if (res.ok) {
        toast.success(`${ROLE_LABELS[role]} permissions saved`)
        setDirty(prev => { const s = new Set(prev); s.delete(role); return s })
      } else {
        toast.error('Failed to save permissions')
      }
    } finally {
      setSaving(null)
    }
  }

  async function resetRole(role: UserRole) {
    const res = await fetch(`/api/settings/role-permissions?role=${role}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`${ROLE_LABELS[role]} reset to defaults`)
      load()
    } else {
      toast.error('Failed to reset')
    }
  }

  async function saveAll() {
    for (const role of EDITABLE_ROLES) {
      if (dirty.has(role)) await saveRole(role)
    }
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

  // Count permissions per role
  const counts = Object.fromEntries(
    EDITABLE_ROLES.map(r => [r, matrix[r].size])
  ) as Record<UserRole, number>

  return (
    <div className="space-y-6">
      <SettingsTabs />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#2E4156' }}>Role Permissions</h1>
          <p className="text-slate-500 text-sm mt-1">
            Configure what each role can see and do. Changes take effect on next login.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty.size > 0 && (
            <span className="text-xs text-orange-600 font-medium">
              {dirty.size} role{dirty.size > 1 ? 's' : ''} with unsaved changes
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reload
          </Button>
          <Button
            size="sm"
            disabled={dirty.size === 0}
            onClick={saveAll}
            style={{ background: '#fa5e01' }}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save All Changes
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-[#D4D8DD] border border-[#AAB7B7] text-sm text-[#1A2D42]">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          Permissions marked with <span className="font-semibold">●</span> are active for that role.
          Changes take effect on the user&apos;s next login session.
        </div>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {EDITABLE_ROLES.map(role => {
          const theme = ROLE_THEME[role]
          const isDirty = dirty.has(role)
          return (
            <div
              key={role}
              className={`rounded-xl border p-3 ${theme.bg} ${theme.border}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold ${theme.text}`}>{ROLE_LABELS[role]}</span>
                {isDirty && <span className="text-xs text-orange-500 font-medium">● unsaved</span>}
              </div>
              <p className="text-2xl font-bold" style={{ color: '#2E4156' }}>{counts[role]}</p>
              <p className="text-xs text-gray-500">permissions granted</p>
            </div>
          )
        })}
      </div>

      {/* Permission Matrix */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        {/* Column headers */}
        <div className="grid bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: '220px repeat(3, 1fr)' }}>
          <div className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />
            Feature / Page
          </div>

          {EDITABLE_ROLES.map(role => {
            const theme = ROLE_THEME[role]
            const isDirty = dirty.has(role)
            return (
              <div key={role} className="p-3 text-center border-l border-gray-200">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${theme.badge}`}>
                  {ROLE_LABELS[role]}
                </span>
                <div className="flex items-center justify-center gap-1 mt-1.5">
                  <button
                    onClick={() => resetRole(role)}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    title="Reset to defaults"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => saveRole(role)}
                    disabled={!isDirty || saving === role}
                    className={`text-xs px-2 py-0.5 rounded font-medium transition-all ${
                      isDirty
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        : 'text-gray-300 cursor-default'
                    }`}
                  >
                    {saving === role ? '...' : isDirty ? 'Save' : <Check className="w-3 h-3 inline" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Permission rows by group */}
        {PAGE_PERMISSIONS.map((group, gi) => (
          <div key={group.group}>
            {/* Group header */}
            <div
              className="grid items-center"
              style={{ gridTemplateColumns: '220px repeat(3, 1fr)', background: '#f8fafc' }}
            >
              <div className="px-3 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100" style={{ borderLeft: '3px solid #fa5e01' }}>
                {group.group}
              </div>
              {EDITABLE_ROLES.map((_, i) => (
                <div key={i} className="border-b border-gray-100 border-l border-l-gray-200 py-2" />
              ))}
            </div>

            {/* Individual permission rows */}
            {group.pages.map((page, pi) => {
              const isLastInGroup = pi === group.pages.length - 1
              const isLastGroup   = gi === PAGE_PERMISSIONS.length - 1
              const rowBorder     = (!isLastInGroup || !isLastGroup) ? 'border-b border-gray-100' : ''

              return (
                <div
                  key={page.key}
                  className={`grid hover:bg-[#D4D8DD]/40 transition-colors ${rowBorder}`}
                  style={{ gridTemplateColumns: '220px repeat(3, 1fr)' }}
                >
                  {/* Feature label */}
                  <div className="px-4 py-2.5 flex flex-col justify-center">
                    <span className="text-sm text-gray-700 font-medium">{page.label}</span>
                    <code className="text-xs text-gray-400 font-mono">{page.permission}</code>
                  </div>

                  {/* Editable role checkboxes */}
                  {EDITABLE_ROLES.map(role => {
                    const checked = matrix[role].has(page.permission)
                    const theme   = ROLE_THEME[role]
                    return (
                      <div
                        key={role}
                        className="flex items-center justify-center border-l border-gray-100 cursor-pointer"
                        onClick={() => toggle(role, page.permission)}
                      >
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            checked
                              ? `${theme.border} border-opacity-0`
                              : 'border-gray-300'
                          }`}
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

      {/* Bottom save bar */}
      {dirty.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-2xl shadow-2xl border z-50"
          style={{ background: '#2E4156', borderColor: 'rgba(255,255,255,0.1)' }}
        >
          <span className="text-white text-sm font-medium">
            {dirty.size} role{dirty.size > 1 ? 's' : ''} with unsaved changes
          </span>
          <button
            onClick={load}
            className="text-xs text-white/60 hover:text-white/90 transition-colors"
          >
            Discard
          </button>
          <Button
            size="sm"
            onClick={saveAll}
            style={{ background: '#fa5e01' }}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save All
          </Button>
        </div>
      )}
    </div>
  )
}
