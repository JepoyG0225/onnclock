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
import { Bell, LogOut, Settings, User } from 'lucide-react'
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
  const [pendingCount, setPendingCount] = useState(0)
  const [items, setItems] = useState<Array<{
    id: string
    type: 'LEAVE' | 'DTR'
    status: string
    title: string
    employee?: string
    employeeNo?: string
    createdAt: string
  }>>([])

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
        const list = (data.items ?? []) as typeof items
        if (active) {
          setItems(list)
          const pending = list.filter(i => i.status === 'PENDING').length
          setPendingCount(pending)
        }
      } catch { /* ignore */ }
    }
    loadCounts()
    const id = window.setInterval(loadCounts, 30000)
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
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {items.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400">No requests yet</div>
            ) : (
              <div className="max-h-80 overflow-auto">
                {items.map(item => (
                  <DropdownMenuItem
                    key={item.id}
                    className="flex items-start gap-2 py-2.5 hover:bg-gray-50 focus:bg-gray-50"
                  >
                    <span className={`mt-0.5 inline-flex h-2 w-2 rounded-full ${
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
                <AvatarFallback className="bg-teal-600 text-white text-sm">
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
