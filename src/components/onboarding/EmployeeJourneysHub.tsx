"use client"
import { LayoutDashboard, UserPlus, UserMinus } from 'lucide-react'
import { TabbedPage } from '@/components/layout/TabbedPage'
import { EmployeeJourneys } from './EmployeeJourneys'
import { OnboardingManager } from './OnboardingManager'
import { OffboardingTab } from '@/components/recruitment/OffboardingTab'
import styles from '@/components/recruitment/Recruitment.module.css'
export function EmployeeJourneysHub({canOnboard,canOffboard}:{canOnboard:boolean;canOffboard:boolean}) {
 return <div className={`${styles.recruitment} space-y-5`}>
  <header className="rounded-2xl border border-slate-200 border-l-4 border-l-[#ff5900] bg-white p-5 sm:p-6"><p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">People / Employee lifecycle</p><h1 className="mt-1 text-2xl font-semibold text-[#162d54]">Employee Journeys</h1><p className="mt-1 text-sm text-slate-500">Manage onboarding, employee progress and offboarding clearance in one place.</p></header>
  <TabbedPage basePath="/employee-journeys" tabs={[
   {id:'overview',label:'Overview',icon:LayoutDashboard,render:()=> <EmployeeJourneys embedded/>},
   ...(canOnboard?[{id:'onboarding',label:'Onboarding',icon:UserPlus,render:()=> <OnboardingManager/>}]:[]),
   ...(canOffboard?[{id:'offboarding',label:'Offboarding',icon:UserMinus,render:()=> <OffboardingTab/>}]:[]),
  ]}/>
 </div>
}
