'use client'

/**
 * Timesheets — time sheets, corrections and overtime in one place.
 *
 * Overtime is deliberately NOT a tab. OT rows are generated from clock data
 * by syncAutoOvertimeRequest — no employee ever files one — so overtime is a
 * property of a timesheet, not a request with its own queue. It's approved
 * inline when the timesheet it belongs to is approved.
 *
 * Corrections stayed a tab because those ARE filed by employees and can
 * arrive for a period whose timesheet is already settled.
 *
 * The active tab lives in `?tab=` rather than component state so deep links
 * from notifications and the browser back button both work. The old
 * /dtr, /time-corrections and /overtime-requests routes redirect here.
 */

import { Suspense, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Clock, ClipboardEdit } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { TimesheetsTab } from '@/components/attendance/TimesheetsTab'
import { CorrectionsTab } from '@/components/attendance/CorrectionsTab'

const TABS = [
  { id: 'timesheets',  label: 'Timesheets',  icon: Clock },
  { id: 'corrections', label: 'Corrections', icon: ClipboardEdit },
] as const

type TabId = (typeof TABS)[number]['id']

function TimesheetsTabs() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const active: TabId = useMemo(() => {
    const t = searchParams.get('tab')
    return TABS.some(x => x.id === t) ? (t as TabId) : 'timesheets'
  }, [searchParams])

  const select = useCallback(
    (id: TabId) => {
      // Preserve any other query the underlying tab relies on (week pickers,
      // employee filters) instead of blowing the whole query string away.
      const next = new URLSearchParams(searchParams.toString())
      next.set('tab', id)
      router.replace(`/timesheets?${next.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(tab => (
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
          </button>
        ))}
      </div>

      {/*
        Each tab is unmounted when inactive. These pages each load a lot on
        mount (a full week of DTR rows, pending queues); keeping all three
        mounted would triple the work on every visit for data the user isn't
        looking at.
      */}
      {active === 'timesheets' && <TimesheetsTab />}
      {active === 'corrections' && <CorrectionsTab />}
    </div>
  )
}

export default function TimesheetsPage() {
  // useSearchParams needs a Suspense boundary to avoid opting the whole
  // route into client-side bailout during prerender.
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><AppSpinner /></div>}>
      <TimesheetsTabs />
    </Suspense>
  )
}
