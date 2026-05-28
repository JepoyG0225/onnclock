'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Building2, CreditCard, Receipt, Wallet, LogOut, ShieldCheck, ArrowDownToLine } from 'lucide-react'

const THEME = {
  deep: '#021e47',
  base: '#032b63',
  mid: '#AAB7B7',
  soft: '#c4d9ff',
  light: '#dce5f7',
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
  {
    href: '/admin/disbursement-topups',
    icon: ArrowDownToLine,
    label: 'Wallet Top-Ups',
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-[240px] border-r flex flex-col px-4 py-5 z-40"
      style={{ background: THEME.deep, borderColor: THEME.base }}
    >
      <Link
        href="/admin/companies"
        className="flex items-center gap-3 rounded-xl border px-3 py-2.5 mb-6 transition-colors"
        style={{ borderColor: THEME.base, background: '#22374f' }}
        title="Admin Console"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#0055d4' }}>
          <ShieldCheck className="w-4.5 h-4.5" style={{ color: THEME.light }} />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: THEME.soft }}>System</p>
          <p className="text-sm font-semibold" style={{ color: THEME.light }}>Admin Console</p>
        </div>
      </Link>

      <nav className="flex flex-col gap-1.5 flex-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
              style={
                isActive
                  ? { background: '#0055d4', color: '#F8FAFC' }
                  : { color: THEME.mid }
              }
            >
              <Icon className="w-4.5 h-4.5" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <button
        onClick={() => signOut({ callbackUrl: '/admin/login' })}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
        style={{ color: THEME.mid, background: 'transparent' }}
      >
        <LogOut className="w-4.5 h-4.5" />
        <span>Sign Out</span>
      </button>
    </aside>
  )
}
