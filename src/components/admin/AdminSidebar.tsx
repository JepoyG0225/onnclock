'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Building2, CreditCard, Receipt, Wallet, LogOut, ShieldCheck } from 'lucide-react'

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
    <aside className="fixed left-0 top-0 h-screen w-[60px] bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 z-40">
      {/* Logo */}
      <Link
        href="/admin/companies"
        className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 mb-6 hover:bg-cyan-500/20 transition-colors group relative"
        title="Admin Console"
      >
        <ShieldCheck className="w-5 h-5 text-cyan-400" />
        <span className="absolute left-full ml-3 px-2 py-1 rounded-md bg-slate-800 text-slate-100 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg border border-slate-700">
          Admin Console
        </span>
      </Link>

      {/* Divider */}
      <div className="w-8 h-px bg-slate-800 mb-4" />

      {/* Nav items */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`relative group flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
                isActive
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Icon className="w-5 h-5" />
              {/* Tooltip */}
              <span className="absolute left-full ml-3 px-2 py-1 rounded-md bg-slate-800 text-slate-100 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg border border-slate-700 z-50">
                {label}
              </span>
              {/* Active indicator */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-cyan-400 rounded-r-full -ml-px" />
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
          className="relative group flex items-center justify-center w-10 h-10 rounded-xl text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="absolute left-full ml-3 px-2 py-1 rounded-md bg-slate-800 text-slate-100 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg border border-slate-700 z-50">
            Sign Out
          </span>
        </button>
      </div>
    </aside>
  )
}
