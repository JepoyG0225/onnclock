'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock, FileText, CreditCard, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_TABS = [
  { href: '/portal/clock', label: 'Attendance', icon: Clock, exact: false },
  { href: '/portal/leaves', label: 'Leave', icon: FileText, exact: false },
  { href: '/portal/payslips', label: 'Payslips', icon: CreditCard, exact: false },
  { href: '/portal/profile', label: 'Profile', icon: User, exact: false },
]

export function PortalBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      {/* Frosted glass pill dock */}
      <div
        className="flex items-stretch justify-around rounded-2xl shadow-2xl mx-auto max-w-md"
        style={{
          background: 'rgba(34, 127, 132, 0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          padding: '8px 4px',
        }}
      >
        {NAV_TABS.map((tab) => {
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-1 px-2 rounded-xl transition-all duration-200 min-w-0"
              style={
                isActive
                  ? { background: 'rgba(250,94,1,0.18)' }
                  : undefined
              }
            >
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-200',
                  isActive ? 'scale-110' : 'scale-100'
                )}
                style={isActive ? { background: '#fa5e01' } : undefined}
              >
                <tab.icon
                  className={cn('w-4 h-4 transition-colors', isActive ? 'text-white' : 'text-white/50')}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
              </div>
              <span
                className={cn(
                  'text-[10px] font-semibold tracking-wide transition-colors truncate max-w-full',
                  isActive ? 'text-white' : 'text-white/40'
                )}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
