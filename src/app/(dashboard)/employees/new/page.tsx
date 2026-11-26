import Link from 'next/link'
import { ArrowLeft, UserRoundPlus } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { EmployeeForm } from '@/components/employees/EmployeeForm'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { getSeatStatus } from '@/lib/billing/seat-limit'

export default async function NewEmployeePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')

  // Don't even render the form when the company is at-or-over their
  // paid seat cap — bounce straight to billing. SUPER_ADMIN bypasses
  // (impersonation support). Mirrors the API's POST /api/employees
  // guard so the experience is consistent whether the user lands here
  // via the navbar, a deep link, or browser history.
  if (session.user.role !== 'SUPER_ADMIN') {
    const seat = await getSeatStatus(companyId)
    if (seat.enforceCap && seat.activeCount >= seat.paidSeats && !seat.canRestoreSeat) {
      redirect('/settings/billing')
    }
  }

  const [departments, positions, workSchedules] = await Promise.all([
    prisma.department.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.position.findMany({
      where: { companyId, isActive: true },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
    prisma.workSchedule.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, scheduleType: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="space-y-6">
      <Link href="/employees" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#162d54]"><ArrowLeft size={15}/>Back to employees</Link>
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="absolute inset-y-0 left-0 w-1 bg-[#ff5900]"/>
        <div className="flex items-start gap-4">
          <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#fff3ec] text-[#c44d00] sm:flex"><UserRoundPlus size={26}/></span>
          <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">People / New employee</p><h1 className="text-2xl font-semibold tracking-tight text-[#162d54]">Add new employee</h1><p className="mt-1 text-sm text-slate-500">Set up their personal details, employment and compensation.</p></div>
        </div>
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">If your seats are full, available billing credit can restore a previously credited seat within your paid seat maximum.</p>
      </header>
      <EmployeeForm
        departments={departments}
        positions={positions}
        workSchedules={workSchedules}
      />
    </div>
  )
}
