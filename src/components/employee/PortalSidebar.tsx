'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { signOut } from 'next-auth/react'
import {
  Clock, FileText, CreditCard, User, BarChart3,
  Bell, LogOut, ChevronDown, AlertTriangle, X, ClipboardList, ClipboardEdit,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ALL_NAV_TABS = [
  { href: '/portal/clock',               label: 'Attendance',   icon: Clock,          exact: false, pro: false, budgetReq: false },
  { href: '/portal/leaves',              label: 'Leave',        icon: FileText,        exact: false, pro: false, budgetReq: false },
  { href: '/portal/time-corrections',    label: 'Time Fixes',   icon: ClipboardEdit,   exact: false, pro: false, budgetReq: false },
  { href: '/portal/payslips',            label: 'Payslips',     icon: CreditCard,      exact: false, pro: false, budgetReq: false },
  { href: '/portal/budget-requisitions', label: 'Budget Req.',  icon: ClipboardList,   exact: false, pro: false, budgetReq: true  },
  { href: '/portal/reviews',             label: 'Reviews',      icon: BarChart3,       exact: false, pro: false, budgetReq: false },
  { href: '/portal/disciplinary',        label: 'Disciplinary', icon: AlertTriangle,   exact: false, pro: true,  budgetReq: false },
  { href: '/portal/profile',             label: 'Profile',      icon: User,            exact: false, pro: false, budgetReq: false },
]

const DISMISSED_KEY = 'portal_dismissed_notifs'

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') } catch { return [] }
}
function setDismissed(ids: string[]) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids))
}

interface PortalSidebarProps {
  companyName?: string
  companyLogoUrl?: string
  employeeName?: string
  employeeInitials?: string
  employeeNo?: string
  showDisciplinary?: boolean
  showBudgetReq?: boolean
}

type NotifItem = {
  id: string
  type: string
  status: string
  title: string
  createdAt: string
  href?: string
}

export function PortalSidebar({
  companyName,
  companyLogoUrl,
  employeeName,
  employeeInitials,
  employeeNo,
  showDisciplinary = false,
  showBudgetReq = false,
}: PortalSidebarProps) {
  const pathname = usePathname()
  const NAV_TABS = ALL_NAV_TABS.filter(t =>
    (!t.pro || showDisciplinary) && (!t.budgetReq || showBudgetReq)
  )
  const [allNotifs, setAllNotifs] = useState<NotifItem[]>([])
  const [dismissed, setDismissedState] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    return getDismissed()
  })
  const [showNotif, setShowNotif] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const notifs = allNotifs.filter(n => !dismissed.includes(n.id))

  function handleClearAll() {
    const ids = [...dismissed, ...allNotifs.map(n => n.id)]
    setDismissed(ids)
    setDismissedState(ids)
  }

  function markAsRead(id: string) {
    if (dismissed.includes(id)) return
    const ids = [...dismissed, id]
    setDismissed(ids)
    setDismissedState(ids)
  }

  // Poll notifications
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch('/api/notifications/portal?limit=20')
        if (!res.ok) return
        const data = await res.json()
        if (active) setAllNotifs(data.items ?? [])
      } catch { /* ignore */ }
    }
    load()
    const id = window.setInterval(load, 30_000)
    return () => { active = false; window.clearInterval(id) }
  }, [])

  async function handleSignOut() {
    const target = '/portal/login'
    document.cookie = 'portal_session=; path=/; Max-Age=0; SameSite=Lax'
    document.cookie = 'portal_session=; path=/portal; Max-Age=0; SameSite=Lax'
    await signOut({ redirect: false }).catch(() => null)
    window.location.assign(target)
  }

  return (
    <aside
      className="hidden lg:flex fixed left-0 top-0 h-screen w-60 flex-col z-30 select-none"
      style={{
        background: '#1A2D42',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* ── Logo / company ── */}
      <div
        className="flex items-center gap-3 px-5 shrink-0"
        style={{ height: '4rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        {companyLogoUrl ? (
          <img src={companyLogoUrl} alt="Company logo" className="h-8 w-auto max-w-[120px] object-contain" />
        ) : (
          <Image
            src="/onclock-logo.png"
            alt="Onclock"
            width={100}
            height={33}
            priority
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV_TABS.map(tab => {
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                isActive
                  ? 'text-white'
                  : 'text-white/55 hover:text-white hover:bg-white/10'
              )}
              style={isActive ? { background: 'rgba(250,94,1,0.85)' } : undefined}
            >
              <tab.icon
                className={cn('w-4 h-4 shrink-0', isActive ? 'text-white' : 'text-white/50')}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {/* ── Footer: notifications + user ── */}
      <div
        className="shrink-0 px-3 pb-4 pt-3 space-y-1"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setShowNotif(v => !v); setShowUserMenu(false) }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/55 hover:text-white hover:bg-white/10 transition-all"
          >
            <div className="relative">
              <Bell className="w-4 h-4" strokeWidth={1.8} />
              {notifs.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[9px] font-black rounded-full min-w-[14px] h-3.5 px-0.5 flex items-center justify-center">
                  {notifs.length > 9 ? '9+' : notifs.length}
                </span>
              )}
            </div>
            <span>Notifications</span>
          </button>

          {/* Notifications popover */}
          {showNotif && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowNotif(false)} />
              <div
                className="absolute bottom-full left-0 mb-2 z-20 w-72 rounded-2xl shadow-2xl overflow-hidden bg-white border border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-150"
              >
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-gray-900 text-sm font-semibold">Notifications</p>
                  {notifs.length > 0 && (
                    <button
                      onClick={handleClearAll}
                      className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Clear all
                    </button>
                  )}
                </div>
                {notifs.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <Bell className="w-6 h-6 text-gray-200 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">You&apos;re all caught up</p>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-auto divide-y divide-gray-50">
                    {notifs.map(item => {
                      const isDisc = item.type === 'DISCIPLINARY'
                      return (
                        <a
                          key={item.id}
                          href={item.href ?? '#'}
                          onClick={() => markAsRead(item.id)}
                          className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <p className="text-sm text-gray-800 font-medium leading-snug">{item.title}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span
                              className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                              style={isDisc
                                ? { background: '#fee2e2', color: '#b91c1c' }
                                : {
                                    background: item.status === 'APPROVED' ? '#dcfce7' : '#fee2e2',
                                    color: item.status === 'APPROVED' ? '#15803d' : '#dc2626',
                                  }
                              }
                            >
                              {isDisc ? item.status : item.status}
                            </span>
                            <p className="text-[10px] text-gray-400">{new Date(item.createdAt).toLocaleString()}</p>
                          </div>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => { setShowUserMenu(v => !v); setShowNotif(false) }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-all group"
          >
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0"
              style={{ background: '#fa5e01' }}
            >
              {employeeInitials ?? 'E'}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white text-xs font-semibold truncate leading-tight">
                {employeeName ?? 'Employee'}
              </p>
              {employeeNo && (
                <p className="text-white/40 text-[10px] leading-tight">{employeeNo}</p>
              )}
              {companyName && (
                <p className="text-white/30 text-[10px] leading-tight truncate">{companyName}</p>
              )}
            </div>
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-white/30 shrink-0 transition-transform duration-150',
                showUserMenu && 'rotate-180'
              )}
            />
          </button>

          {/* User dropdown */}
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
              <div
                className="absolute bottom-full left-0 mb-2 z-20 w-full rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
                style={{
                  background: '#2E4156',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-white text-sm font-semibold truncate">{employeeName ?? 'Employee'}</p>
                  {employeeNo && <p className="text-white/40 text-xs mt-0.5">{employeeNo}</p>}
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-red-400 hover:bg-white/5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
