'use client'

import { Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { signOut } from 'next-auth/react'

interface PortalHeaderProps {
  companyName?: string
  companyLogoUrl?: string
  employeeName?: string
  employeeInitials?: string
  employeeNo?: string
}

export function PortalHeader({ companyName, companyLogoUrl, employeeName, employeeInitials, employeeNo }: PortalHeaderProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [items, setItems] = useState<Array<{
    id: string
    type: 'LEAVE'
    status: string
    title: string
    createdAt: string
  }>>([])
  const [showNotif, setShowNotif] = useState(false)

  async function handlePortalSignOut() {
    const target = '/portal/login'
    document.cookie = 'portal_session=; path=/; Max-Age=0; SameSite=Lax'
    document.cookie = 'portal_session=; path=/portal; Max-Age=0; SameSite=Lax'
    await signOut({ redirect: false, callbackUrl: target }).catch(() => null)
    window.location.assign(target)
  }

  useEffect(() => {
    let active = true
    async function loadNotifications() {
      try {
        const res = await fetch('/api/notifications/portal?limit=20')
        if (!res.ok) return
        const data = await res.json()
        if (active) setItems(data.items ?? [])
      } catch { /* ignore */ }
    }
    loadNotifications()
    const id = window.setInterval(loadNotifications, 30000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <header
      className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14"
      style={{
        background: 'rgba(26,45,66,0.97)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Left - Onclock Logo */}
      <div className="flex items-center gap-3 min-w-0">
        {companyLogoUrl ? (
          <img
            src={companyLogoUrl}
            alt="Company logo"
            className="h-8 w-auto"
          />
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
        {companyName && (
          <div className="hidden sm:block border-l border-white/20 pl-3 min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight opacity-70">
              {companyName}
            </p>
            {employeeNo && (
              <p className="text-white/40 text-[10px] leading-tight">{employeeNo}</p>
            )}
          </div>
        )}
      </div>

      {/* Right - Notification + Avatar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowNotif(v => !v)}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors relative"
        >
          <Bell className="w-4 h-4" />
          {items.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
              {items.length}
            </span>
          )}
        </button>
        {showNotif && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowNotif(false)} />
            <div
              className="absolute right-12 top-12 z-20 rounded-2xl shadow-2xl overflow-hidden w-72 bg-white border border-gray-200"
            >
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-gray-900 text-sm font-semibold">Notifications</p>
              </div>
              {items.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray-400">No updates yet</div>
              ) : (
                <div className="max-h-72 overflow-auto">
                  {items.map(item => (
                    <div key={item.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                      <p className="text-sm text-gray-900 font-medium">{item.title}</p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: item.status === 'APPROVED' ? '#2E4156' : '#ef4444' }}
                      >
                        {item.status}
                      </p>
                      <p className="text-[10px] text-gray-400">{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Avatar with dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(v => !v)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={{ background: '#fa5e01' }}
          >
            {employeeInitials ?? 'E'}
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div
                className="absolute right-0 top-10 z-20 rounded-2xl shadow-2xl overflow-hidden min-w-[180px]"
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
                  onClick={handlePortalSignOut}
                  className="w-full px-4 py-3 text-left text-sm font-medium text-red-400 hover:bg-white/5 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

