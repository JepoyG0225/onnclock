'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Building, Shield, Mail, Users, Lock, CheckCircle, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/settings', label: 'Company', icon: Building },
  { href: '/settings?tab=government', label: 'Government IDs', icon: Shield },
  { href: '/settings?tab=email', label: 'Email', icon: Mail },
  { href: '/settings/users', label: 'User Management', icon: Users },
  { href: '/settings/permissions', label: 'Role Permissions', icon: Lock },
  { href: '/settings/approvals', label: 'Approval Workflows', icon: CheckCircle },
  { href: '/settings?tab=storage', label: 'Storage', icon: HardDrive },
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

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border bg-gray-50 p-1">
      {TABS.map(tab => {
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
          </Link>
        )
      })}
    </div>
  )
}
