'use client'

/**
 * Client half of /portal/performance. The entitlement decision is made on the
 * server and arrives as a plain boolean, because TabbedPage takes `render`
 * callbacks and functions cannot cross the server/client boundary.
 */
import { BarChart3, AlertTriangle } from 'lucide-react'
import { TabbedPage } from '@/components/layout/TabbedPage'
import { ReviewsTab } from '@/components/employee/ReviewsTab'
import { DisciplinaryTab } from '@/components/employee/DisciplinaryTab'

export function PerformanceTabs({ showDisciplinary }: { showDisciplinary: boolean }) {
  return (
    <div className="px-4 py-5 lg:px-8 lg:py-8 max-w-2xl mx-auto">
    <TabbedPage
      basePath="/portal/performance"
      tabs={[
        { id: 'reviews', label: 'Reviews', icon: BarChart3, render: () => <ReviewsTab /> },
        ...(showDisciplinary
          ? [{
              id: 'disciplinary',
              label: 'Disciplinary',
              icon: AlertTriangle,
              render: () => <DisciplinaryTab />,
            }]
          : []),
      ]}
    />
    </div>
  )
}
