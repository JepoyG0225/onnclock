'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bell, LogOut, Settings, User, X } from 'lucide-react'
import { toast } from 'sonner'
import { useSidebar } from './SidebarContext'

interface AppHeaderProps {
  user?: {
    email?: string | null
    name?: string | null
  }
  companyName?: string
}

export function AppHeader({ user, companyName }: AppHeaderProps) {
  const router = useRouter()
  const { collapsed } = useSidebar()
  const [allItems, setAllItems] = useState<Array<{
    id: string
    type: 'LEAVE' | 'DTR' | 'DISCIPLINARY' | 'TIME_CORRECTION' | 'OVERTIME'
    status: string
    title: string
    employee?: string
    employeeNo?: string
    createdAt: string
    href?: string
  }>>([])
  const [dismissed, setDismissed] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('admin_dismissed_notifs') ?? '[]') } catch { return [] }
  })

  const DISMISSED_KEY = 'admin_dismissed_notifs'

  const items = allItems.filter(i => !dismissed.includes(i.id))
  const pendingCount = items.length

  function handleClearAll() {
    const ids = [...dismissed, ...allItems.map(i => i.id)]
    setDismissed(ids)
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids)) } catch { /* */ }
  }

  function markAsRead(id: string) {
    if (dismissed.includes(id)) return
    const ids = [...dismissed, id]
    setDismissed(ids)
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids)) } catch { /* */ }
  }

  const displayName = user?.name || user?.email || 'User'
  const initials = displayName.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'U'

  async function handleSignOut() {
    const target = '/login'
    document.cookie = 'portal_session=; path=/; Max-Age=0; SameSite=Lax'
    await signOut({ redirect: false, callbackUrl: target }).catch(() => null)
    toast.info('Signed out successfully')
    window.location.assign(target)
  }

  useEffect(() => {
    let active = true
    async function loadCounts() {
      try {
        const res = await fetch('/api/notifications/admin?limit=20')
        if (!res.ok) return
        const data = await res.json()
        if (active) setAllItems(data.items ?? [])
      } catch { /* ignore */ }
    }
    loadCounts()
    const id = window.setInterval(loadCounts, 60000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <header
      className="fixed top-0 right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-10 transition-all duration-300"
      style={{ left: collapsed ? '4rem' : '16rem' }}
    >
      {/* Company name */}
      <div>
        <p className="text-sm font-semibold text-gray-800">{companyName || 'Company'}</p>
        <p className="text-xs text-gray-500">HR & Payroll System</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-gray-500 relative">
              <Bell className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="py-0">Notifications</DropdownMenuLabel>
              {items.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Clear all
                </button>
              )}
            </div>
            <DropdownMenuSeparator />
            {items.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">
                <Bell className="w-5 h-5 text-gray-200 mx-auto mb-1.5" />
                All caught up
              </div>
            ) : (
              <div className="max-h-80 overflow-auto">
                {items.map(item => (
                  <DropdownMenuItem
                    key={item.id}
                    className="flex items-start gap-2 py-2.5 hover:bg-gray-50 focus:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      markAsRead(item.id)
                      if (item.href) router.push(item.href)
                    }}
                  >
                    <span className={`mt-0.5 inline-flex h-2 w-2 rounded-full flex-shrink-0 ${
                      item.type === 'DISCIPLINARY' ? 'bg-red-500' :
                      item.status === 'PENDING' ? 'bg-orange-500' :
                      item.status === 'APPROVED' ? 'bg-emerald-500' :
                      item.status === 'REJECTED' ? 'bg-red-500' : 'bg-gray-300'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900">{item.title}</p>
                      {item.employee && (
                        <p className="text-[11px] text-gray-500 truncate">{item.employee} · {item.employeeNo}</p>
                      )}
                      <p className="text-[10px] text-gray-400">{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-white text-sm" style={{ background: '#2E4156' }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:block">{displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <p className="font-medium">{displayName}</p>
              <p className="text-xs text-gray-500 font-normal truncate">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings/profile')}>
              <User className="mr-2 w-4 h-4" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <Settings className="mr-2 w-4 h-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
              <LogOut className="mr-2 w-4 h-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
