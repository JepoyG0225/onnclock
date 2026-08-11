'use client'

/**
 * Performance — reviews, disciplinary records and the tardiness report.
 *
 * GATING IS PER-TAB, NOT PER-ROUTE, and that's the whole reason this file
 * exists instead of a plain `layout.tsx` with one <HrisProGate> around
 * everything.
 *
 * Reviews and Disciplinary each had their own Pro-gated layout before the
 * merge. Tardiness did NOT — it lived under /attendance and was available on
 * every plan. Wrapping the merged route in a single gate would have taken a
 * working feature away from non-Pro customers as a side effect of a layout
 * change, so the gate is applied to the two tabs that always had one and
 * Tardiness stays open.
 */

import { Suspense, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BarChart3, AlertTriangle, TrendingDown, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { HrisProGate } from '@/components/layout/HrisProGate'
import { ReviewsTab } from './ReviewsTab'
import { DisciplinaryTab } from './DisciplinaryTab'
import { TardinessTab } from './TardinessTab'

const TABS = [
  { id: 'reviews',      label: 'Reviews',      icon: BarChart3,     pro: true,  feature: 'Performance Reviews' },
  { id: 'disciplinary', label: 'Disciplinary', icon: AlertTriangle, pro: true,  feature: 'Disciplinary Records' },
  { id: 'tardiness',    label: 'Tardiness',    icon: TrendingDown,  pro: false, feature: null },
] as const

type TabId = (typeof TABS)[number]['id']

function Tabs({ hrisProEnabled }: { hrisProEnabled: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const active: TabId = useMemo(() => {
    const t = searchParams.get('tab')
    return TABS.some(x => x.id === t) ? (t as TabId) : 'reviews'
  }, [searchParams])

  const select = useCallback(
    (id: TabId) => {
      const next = new URLSearchParams(searchParams.toString())
      next.set('tab', id)
      router.replace(`/performance?${next.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const current = TABS.find(t => t.id === active) ?? TABS[0]
  const locked = current.pro && !hrisProEnabled

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(tab => {
          const tabLocked = tab.pro && !hrisProEnabled
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => select(tab.id)}
              aria-current={active === tab.id ? 'page' : undefined}
              data-tour-tab={tab.id}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition',
                active === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {/* Surface the lock on the tab itself so it's obvious why a
                  tab is unavailable before clicking into an upsell screen. */}
              {tabLocked && <Lock className="h-3 w-3 text-amber-500" />}
            </button>
          )
        })}
      </div>

      {locked ? (
        <HrisProGate enabled={false} featureName={current.feature ?? undefined}>
          {null}
        </HrisProGate>
      ) : (
        <>
          {active === 'reviews' && <ReviewsTab />}
          {active === 'disciplinary' && <DisciplinaryTab />}
          {active === 'tardiness' && <TardinessTab />}
        </>
      )}
    </div>
  )
}

export function PerformanceTabs({ hrisProEnabled }: { hrisProEnabled: boolean }) {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><AppSpinner /></div>}>
      <Tabs hrisProEnabled={hrisProEnabled} />
    </Suspense>
  )
}
