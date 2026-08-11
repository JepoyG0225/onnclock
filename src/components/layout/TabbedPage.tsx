'use client'

/**
 * Shared shell for pages that merged several former sidebar entries into tabs.
 *
 * The active tab lives in `?tab=` rather than component state, so deep links
 * from notifications, the browser back button, and bookmarks all keep
 * working after a merge. Every legacy route redirects in with its tab
 * pre-selected.
 *
 * Inactive tabs are UNMOUNTED, not hidden. These pages each load real data on
 * mount (a week of DTR rows, a full employee roster, a loan ledger); keeping
 * them all mounted would multiply the work on every visit for data the user
 * isn't looking at.
 */

import { Suspense, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AppSpinner } from '@/components/ui/AppSpinner'

export interface PageTab {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  /** Rendered only while this tab is active. */
  render: () => React.ReactNode
}

function Tabs({ tabs, basePath }: { tabs: PageTab[]; basePath: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const active = useMemo(() => {
    const t = searchParams.get('tab')
    return tabs.some(x => x.id === t) ? (t as string) : tabs[0]?.id
  }, [searchParams, tabs])

  const select = useCallback(
    (id: string) => {
      // Preserve any other query the underlying tab relies on (week pickers,
      // filters) instead of discarding the whole query string.
      const next = new URLSearchParams(searchParams.toString())
      next.set('tab', id)
      router.replace(`${basePath}?${next.toString()}`, { scroll: false })
    },
    [router, searchParams, basePath],
  )

  const current = tabs.find(t => t.id === active) ?? tabs[0]

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map(tab => (
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
            {tab.icon && <tab.icon className="h-4 w-4" />}
            {tab.label}
          </button>
        ))}
      </div>

      {current?.render()}
    </div>
  )
}

export function TabbedPage({ tabs, basePath }: { tabs: PageTab[]; basePath: string }) {
  // useSearchParams needs a Suspense boundary so the route isn't forced into
  // a client-side bailout during prerender.
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><AppSpinner /></div>}>
      <Tabs tabs={tabs} basePath={basePath} />
    </Suspense>
  )
}
