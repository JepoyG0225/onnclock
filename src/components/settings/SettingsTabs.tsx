'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Building, Shield, Mail, Users, Lock, CheckCircle, HardDrive, LineChart, ShieldCheck, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'
import NewFeatureBadge from '@/components/ui/NewFeatureBadge'
import { canAccessPath } from '@/lib/auth/page-access'
import { usePermissions } from '@/components/auth/PermissionsProvider'

const TABS = [
  { href: '/settings', label: 'Company', icon: Building },
  { href: '/settings?tab=government', label: 'Government IDs', icon: Shield },
  { href: '/settings?tab=email', label: 'Email', icon: Mail },
  { href: '/settings/users', label: 'User Management', icon: Users, releasedAt: '2026-05-01T00:00:00+08:00' },
  { href: '/settings/permissions', label: 'Role Permissions', icon: Lock, releasedAt: '2026-05-01T00:00:00+08:00' },
  { href: '/settings/approvals', label: 'Approval Workflows', icon: CheckCircle, releasedAt: '2026-05-01T00:00:00+08:00' },
  { href: '/settings/payroll-rules', label: 'Shift Differential', icon: LineChart, releasedAt: '2026-05-01T00:00:00+08:00' },
  { href: '/settings/audit', label: 'Audit & Compliance', icon: ShieldCheck, releasedAt: '2026-05-01T00:00:00+08:00' },
  { href: '/settings?tab=storage', label: 'Storage', icon: HardDrive },
  { href: '/settings/billing', label: 'Billing', icon: CreditCard },
] as const

function isActive(pathname: string, currentTab: string | null, href: string) {
  if (!href.startsWith('/settings?tab=')) return pathname === href
  if (pathname !== '/settings') return false
  const tab = href.split('tab=')[1] ?? ''
  if (!currentTab) return tab === ''
  return currentTab === tab
}

export function SettingsTabs() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')
  const permissions = usePermissions()

  // Hide tabs the current user can't open. Tabs that are query-string
  // variants of /settings (Company / Government IDs / Email / Storage)
  // all live under /settings, so they're visible iff the user can access
  // /settings at all. Dedicated sub-pages (Users, Permissions, Approvals,
  // Payroll Rules, Audit, Billing) check their own canonical path —
  // matches the sidebar filter and the layout-level route guard, so they
  // can never disagree.
  const visibleTabs = TABS.filter(tab => {
    const canonical = tab.href.startsWith('/settings?tab=') ? '/settings' : tab.href
    return canAccessPath(canonical, permissions)
  })

  if (visibleTabs.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border bg-gray-50 p-1" data-tour="settings-tabs">
      {visibleTabs.map(tab => {
        const active = isActive(pathname, currentTab, tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
              active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            {'releasedAt' in tab ? <NewFeatureBadge releasedAt={tab.releasedAt} /> : null}
          </Link>
        )
      })}
    </div>
  )
}
