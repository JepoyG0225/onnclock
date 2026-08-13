'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock, FileText, CreditCard, User, BarChart3, AlertTriangle, ClipboardList, ClipboardEdit, Banknote, MoreHorizontal, X, type LucideProps, ListChecks, Home} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

type IconComponent = React.ComponentType<LucideProps>

// Primary tabs always shown in bottom bar.
// `tasks: true` marks an entry that requires the Task Management entitlement —
// it drops out of the row entirely (rather than 404ing on tap) for companies
// without it, so the bar re-flows to 3 items + More.
const PRIMARY_TABS: { href: string; label: string; icon: IconComponent; exact: boolean; tasks?: boolean }[] = [
  { href: '/portal',        label: 'Home',       icon: Home,       exact: true  },
  { href: '/portal/tasks',  label: 'Tasks',      icon: ListChecks, exact: false, tasks: true },
  { href: '/portal/leaves', label: 'Leave',      icon: FileText,   exact: false },
]

// Extra items exposed in the "More" drawer
interface MoreTab {
  href: string
  label: string
  icon: IconComponent
  pro?: boolean
  budgetReq?: boolean
}

const ALL_MORE_TABS: MoreTab[] = [
  { href: '/portal/clock',               label: 'My Attendance',       icon: Clock                           },
  { href: '/portal/payslips',            label: 'Payslips',            icon: CreditCard                      },
  { href: '/portal/time-corrections',    label: 'Time Corrections',    icon: ClipboardEdit                   },
  { href: '/portal/loans',               label: 'Loans & Advances',    icon: Banknote                        },
  { href: '/portal/budget-requisitions', label: 'Budget Requisitions', icon: ClipboardList, budgetReq: true  },
  { href: '/portal/performance',         label: 'Performance',         icon: BarChart3                       },
  { href: '/portal/profile',             label: 'Profile',             icon: User                            },
]

export function PortalBottomNav({
  showDisciplinary = false,
  showBudgetReq = false,
  showTasks = false,
}: {
  showDisciplinary?: boolean
  showBudgetReq?: boolean
  showTasks?: boolean
}) {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)

  const moreTabs = ALL_MORE_TABS.filter(t =>
    (!t.pro || showDisciplinary) && (!t.budgetReq || showBudgetReq)
  )

  const primaryTabs = PRIMARY_TABS.filter(t => !t.tasks || showTasks)

  // Close drawer when navigating
  useEffect(() => { setShowMore(false) }, [pathname])

  // Is one of the "more" tabs currently active?
  const moreActive = moreTabs.some(t => pathname.startsWith(t.href))

  return (
    <>
      {/* More Drawer — full-screen overlay + bottom sheet */}
      {showMore && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setShowMore(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg rounded-t-3xl shadow-2xl"
            style={{
              background: 'rgba(2,30,71,0.98)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: '20px 20px 40px',
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <p className="text-white text-sm font-bold tracking-wide">More</p>
              <button
                onClick={() => setShowMore(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              >
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {moreTabs.map(tab => {
                const isActive = pathname.startsWith(tab.href)
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl transition-all duration-150"
                    style={isActive
                      ? { background: 'rgba(250,94,1,0.85)' }
                      : { background: 'rgba(255,255,255,0.08)' }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={isActive
                        ? { background: 'rgba(255,255,255,0.25)' }
                        : { background: 'rgba(255,255,255,0.12)' }}
                    >
                      <tab.icon
                        className={cn('w-5 h-5', isActive ? 'text-white' : 'text-white/60')}
                        strokeWidth={isActive ? 2.4 : 1.8}
                      />
                    </div>
                    <span className={cn('text-[11px] font-semibold text-center leading-tight', isActive ? 'text-white' : 'text-white/50')}>
                      {tab.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Bottom navigation bar */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 px-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      >
        <div
          className="flex items-stretch justify-around rounded-2xl shadow-2xl mx-auto max-w-lg"
          style={{
            background: 'rgba(2,30,71,0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.12)',
            padding: '8px 4px',
          }}
        >
          {primaryTabs.map((tab) => {
            const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                // Labels are gone, so the accessible name has to come from
                // aria-label — otherwise the tab announces as a bare link and
                // the dock becomes unusable with a screen reader.
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                title={tab.label}
                className="flex items-center justify-center flex-1 py-1.5 rounded-2xl transition-all duration-200 min-w-0"
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-11 h-11 rounded-2xl transition-all duration-200',
                    isActive ? 'scale-105' : 'scale-100'
                  )}
                  style={isActive ? { background: '#ff5900' } : undefined}
                >
                  <tab.icon
                    className={cn('w-5 h-5 transition-colors', isActive ? 'text-white' : 'text-white/45')}
                    strokeWidth={isActive ? 2.4 : 1.9}
                  />
                </div>
              </Link>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(v => !v)}
            aria-label="More"
            aria-expanded={showMore}
            title="More"
            className="flex items-center justify-center flex-1 py-1.5 rounded-2xl transition-all duration-200 min-w-0"
          >
            <div
              className={cn(
                'flex items-center justify-center w-11 h-11 rounded-2xl transition-all duration-200',
                (showMore || moreActive) ? 'scale-105' : 'scale-100'
              )}
              style={showMore || moreActive ? { background: '#ff5900' } : undefined}
            >
              <MoreHorizontal
                className={cn('w-5 h-5 transition-colors', (showMore || moreActive) ? 'text-white' : 'text-white/45')}
                strokeWidth={(showMore || moreActive) ? 2.4 : 1.9}
              />
            </div>
          </button>
        </div>
      </nav>
    </>
  )
}
