'use client'

/**
 * Organization — departments, positions and the org chart.
 *
 * All three are views of the same structure: departments are the boxes,
 * positions are the titles inside them, and the chart is that same data
 * drawn as a tree. They were three sidebar entries describing one thing.
 */
import { Building2, Briefcase, Network } from 'lucide-react'
import { TabbedPage } from '@/components/layout/TabbedPage'
import { DepartmentsTab } from '@/components/organization/DepartmentsTab'
import { PositionsTab } from '@/components/organization/PositionsTab'
import { OrgChartTab } from '@/components/organization/OrgChartTab'

export default function OrganizationPage() {
  return (
    <TabbedPage
      basePath="/organization"
      tabs={[
        { id: 'departments', label: 'Departments', icon: Building2, render: () => <DepartmentsTab /> },
        { id: 'positions',   label: 'Positions',   icon: Briefcase, render: () => <PositionsTab /> },
        { id: 'org-chart',   label: 'Org Chart',   icon: Network,   render: () => <OrgChartTab /> },
      ]}
    />
  )
}
