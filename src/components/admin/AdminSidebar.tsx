'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Building2, CreditCard, Receipt, Wallet, LogOut, ShieldCheck } from 'lucide-react'

const THEME = {
  deep: '#1A2D42',
  base: '#2E4156',
  mid: '#AAB7B7',
  soft: '#C0C8CA',
  light: '#D4D8DD',
} as const

const NAV_ITEMS = [
  {
    href: '/admin/companies',
    icon: Building2,
    label: 'Companies',
  },
  {
    href: '/admin/subscriptions',
    icon: CreditCard,
    label: 'Subscriptions',
  },
  {
    href: '/admin/payments',
    icon: Receipt,
    label: 'Payments',
  },
  {
    href: '/admin/payment-methods',
    icon: Wallet,
    label: 'Payment Methods',
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-[60px] border-r flex flex-col items-center py-4 z-40"
      style={{ background: THEME.deep, borderColor: THEME.base }}
    >
      {/* Logo */}
      <Link
        href="/admin/companies"
        className="flex items-center justify-center w-10 h-10 rounded-xl border mb-6 transition-colors group relative"
        style={{ background: THEME.base, borderColor: THEME.soft }}
        title="Admin Console"
      >
        <ShieldCheck className="w-5 h-5" style={{ color: THEME.light }} />
        <span
          className="absolute left-full ml-3 px-2 py-1 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg border"
          style={{ background: THEME.deep, color: THEME.light, borderColor: THEME.base }}
        >
          Admin Console
        </span>
      </Link>

      {/* Divider */}
      <div className="w-8 h-px mb-4" style={{ background: THEME.base }} />

      {/* Nav items */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className="relative group flex items-center justify-center w-10 h-10 rounded-xl transition-colors"
              style={
                isActive
                  ? { background: THEME.base, color: THEME.light, boxShadow: `0 8px 20px ${THEME.deep}66` }
                  : { color: THEME.mid }
              }
            >
              <Icon className="w-5 h-5" />
              {/* Tooltip */}
              <span
                className="absolute left-full ml-3 px-2 py-1 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg border z-50"
                style={{ background: THEME.deep, color: THEME.light, borderColor: THEME.base }}
              >
                {label}
              </span>
              {/* Active indicator */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full -ml-px"
                  style={{ background: THEME.soft }}
                />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="mt-auto">
        <button
          onClick={() => signOut({ callbackUrl: '/admin/login' })}
          title="Sign Out"
          className="relative group flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-[#2E4156]"
          style={{ color: THEME.mid }}
        >
          <LogOut className="w-5 h-5" />
          <span
            className="absolute left-full ml-3 px-2 py-1 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg border z-50"
            style={{ background: THEME.deep, color: THEME.light, borderColor: THEME.base }}
          >
            Sign Out
          </span>
        </button>
      </div>
    </aside>
  )
}
