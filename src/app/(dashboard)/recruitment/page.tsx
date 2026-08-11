'use client'

/**
 * Recruitment — the employee lifecycle, end to end.
 *
 * Hiring, Onboarding and Offboarding were three sidebar entries tracking one
 * person through one journey: you hire them, you onboard them, eventually you
 * offboard them. Same people, same records, sequential in time.
 *
 * All three were HRIS-Pro gated before the merge and all three still are —
 * /recruitment/layout.tsx wraps this route in <HrisProGate>, so the tabs
 * inherit exactly the entitlement they had as standalone pages. The nested
 * routes (/recruitment/[jobId], /settings, /templates) sit under that same
 * layout and are untouched by the merge.
 */
import { ClipboardList, CheckCircle, UserMinus } from 'lucide-react'
import { TabbedPage } from '@/components/layout/TabbedPage'
import { HiringTab } from '@/components/recruitment/HiringTab'
import { OffboardingTab } from '@/components/recruitment/OffboardingTab'
import { OnboardingManager } from '@/components/onboarding/OnboardingManager'

export default function RecruitmentPage() {
  return (
    <TabbedPage
      basePath="/recruitment"
      tabs={[
        { id: 'hiring',      label: 'Hiring',      icon: ClipboardList, render: () => <HiringTab /> },
        { id: 'onboarding',  label: 'Onboarding',  icon: CheckCircle,   render: () => <OnboardingManager /> },
        { id: 'offboarding', label: 'Offboarding', icon: UserMinus,     render: () => <OffboardingTab /> },
      ]}
    />
  )
}
