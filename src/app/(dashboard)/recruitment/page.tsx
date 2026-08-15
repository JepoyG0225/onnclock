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
import { useState } from 'react'
import Link from 'next/link'
import { BriefcaseBusiness, CalendarClock, CheckCircle, ChevronRight, FileSignature, LayoutDashboard, Mail, Palette, Settings2, SlidersHorizontal, UserMinus, UsersRound, X } from 'lucide-react'
import { TabbedPage } from '@/components/layout/TabbedPage'
import { HiringTab } from '@/components/recruitment/HiringTab'
import { OffboardingTab } from '@/components/recruitment/OffboardingTab'
import { OnboardingManager } from '@/components/onboarding/OnboardingManager'
import { CandidatesTab, InterviewsTab } from '@/components/recruitment/RecruitmentPeopleTabs'
import { RecruitmentDashboardTab } from '@/components/recruitment/RecruitmentDashboardTab'

export default function RecruitmentPage() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <div className="relative">
        <button type="button" onClick={() => setSettingsOpen(true)} className="absolute right-0 top-1 z-10 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600" aria-label="Open recruitment settings">
          <Settings2 className="h-[18px] w-[18px]" />
        </button>
        <div className="pr-12">
          <TabbedPage
            basePath="/recruitment"
            tabs={[
              { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard, render: () => <RecruitmentDashboardTab /> },
              { id: 'jobs',        label: 'Jobs',        icon: BriefcaseBusiness, render: () => <HiringTab /> },
              { id: 'candidates',  label: 'Candidates',  icon: UsersRound, render: () => <CandidatesTab /> },
              { id: 'interviews',  label: 'Interviews',  icon: CalendarClock, render: () => <InterviewsTab /> },
              { id: 'onboarding',  label: 'Onboarding',  icon: CheckCircle,   render: () => <OnboardingManager /> },
              { id: 'offboarding', label: 'Offboarding', icon: UserMinus,     render: () => <OffboardingTab /> },
            ]}
          />
        </div>
      </div>

      {settingsOpen && <RecruitmentSettingsDrawer onClose={() => setSettingsOpen(false)} />}
    </>
  )
}

function RecruitmentSettingsDrawer({ onClose }: { onClose: () => void }) {
  const items = [
    { href: '/recruitment?tab=candidates&managePipeline=1', icon: SlidersHorizontal, title: 'Manage Pipelines', description: 'Create, order, and customize candidate stages.' },
    { href: '/recruitment/documents', icon: FileSignature, title: 'Offers & Contracts', description: 'Create templates, configure signatories, and collect e-signatures.' },
    { href: '/recruitment/settings', icon: Palette, title: 'Customize Career Page', description: 'Update your public careers page branding and content.' },
    { href: '/recruitment/templates', icon: Mail, title: 'Email Templates', description: 'Create reusable messages for every hiring stage.' },
  ]

  return <div className="fixed inset-0 z-50">
    <button type="button" onClick={onClose} className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]" aria-label="Close recruitment settings" />
    <aside role="dialog" aria-modal="true" aria-label="Recruitment settings" className="absolute inset-y-0 right-0 flex w-full max-w-md animate-in slide-in-from-right duration-300 flex-col bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
        <div><h2 className="text-lg font-black text-slate-900">Recruitment Settings</h2><p className="mt-1 text-xs text-slate-500">Configure how your company attracts and manages candidates.</p></div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-5 w-5" /></button>
      </header>
      <div className="space-y-3 overflow-y-auto p-5">
        {items.map(item => <Link key={item.title} href={item.href} onClick={onClose} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#bfdbfe] hover:bg-[#f4f8ff] hover:shadow-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb] transition group-hover:bg-[#dbeafe]"><item.icon className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-black text-slate-900">{item.title}</span><span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{item.description}</span></span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#2563eb]" />
        </Link>)}
      </div>
    </aside>
  </div>
}
