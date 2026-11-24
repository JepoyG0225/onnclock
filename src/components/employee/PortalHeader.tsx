'use client'

import { usePortalNotifications } from './usePortalNotifications'
import { Bell } from 'lucide-react'
import { useState } from 'react'
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
  const [showNotif, setShowNotif] = useState(false)
  const { items, busy, error, markAsRead, markAllAsRead } = usePortalNotifications()

  async function handlePortalSignOut() {
    const target = '/portal/login'
    document.cookie = 'portal_session=; path=/; Max-Age=0; SameSite=Lax'
    document.cookie = 'portal_session=; path=/portal; Max-Age=0; SameSite=Lax'
    await signOut({ redirect: false, callbackUrl: target }).catch(() => null)
    window.location.assign(target)
  }

  return (
    <header
      className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14"
      style={{
        background: 'var(--brand-primary)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.2)',
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
            style={{ filter: undefined }}
          />
        )}
        {companyName && (
          <div className="hidden sm:block border-l border-white/25 pl-3 min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight">
              {companyName}
            </p>
            {employeeNo && (
              <p className="text-white/80 text-[10px] leading-tight">{employeeNo}</p>
            )}
          </div>
        )}
      </div>

      {/* Right - Notification + Avatar */}
      <div className="flex items-center gap-2">
        <button
          aria-label="Notifications"
          aria-expanded={showNotif}
          onClick={() => setShowNotif(v => !v)}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white hover:text-white hover:bg-white/15 transition-colors relative"
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
              className="absolute right-4 top-12 z-20 rounded-2xl shadow-2xl overflow-hidden w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200"
            >
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                <p className="text-gray-900 text-sm font-semibold">Notifications</p>
                {items.length > 0 && <button type="button" onClick={markAllAsRead} disabled={busy} className="min-h-9 text-xs font-semibold text-blue-700 disabled:opacity-50">{busy ? 'Marking...' : 'Mark all as read'}</button>}
              </div>
              {error && <p role="alert" className="px-4 py-2 text-xs text-red-600">{error}</p>}
              {items.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray-400">No updates yet</div>
              ) : (
                <div className="max-h-72 overflow-auto">
                  {items.map(item => (
                    <a
                      key={item.id}
                      href={item.href ?? '#'}
                      onClick={() => markAsRead(item.id)}
                      className="block px-4 py-3 border-b border-gray-100 last:border-b-0"
                    >
                      <p className="text-sm text-gray-900 font-medium">{item.title}</p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: item.status === 'APPROVED' ? '#000000' : '#ef4444' }}
                      >
                        {item.status}
                      </p>
                      <p className="text-[10px] text-gray-400">{new Date(item.createdAt).toLocaleString()}</p>
                    </a>
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
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-xs font-black text-white shadow-sm ring-1 ring-white/30 transition-transform hover:scale-105 active:scale-95"
          >
            {employeeInitials ?? 'E'}
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              {/* Light surface. This was a solid blue panel hanging off the
                  navy header, which read as part of the header rather than as a
                  menu — and the white-on-blue text was the only place in the
                  portal styled that way. */}
              <div
                className="absolute right-0 top-10 z-20 rounded-2xl shadow-xl overflow-hidden min-w-[190px] bg-white border border-slate-200"
              >
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-slate-900 text-sm font-bold truncate">{employeeName ?? 'Employee'}</p>
                  {employeeNo && <p className="text-slate-400 text-xs mt-0.5">{employeeNo}</p>}
                </div>
                <button
                  onClick={handlePortalSignOut}
                  className="w-full px-4 py-3 text-left text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
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
