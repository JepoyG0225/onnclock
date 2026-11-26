import Link from 'next/link'

export function PayrollJourney({ runId, status = 'DRAFT', stage = 'setup' }: { runId?: string; status?: string; stage?: 'setup' | 'review' | 'approval' }) {
  const current = status === 'DISBURSED' ? 3 : stage === 'setup' ? 0 : stage === 'review' ? 1 : 2
  const steps = [
    { name: 'Setup', detail: 'Period and employees', href: runId ? `/payroll/new?runId=${runId}` : null },
    { name: 'Calculate & Review', detail: 'Check pay and deductions', href: runId ? `/payroll/${runId}?stage=inputs` : null },
    { name: 'Approval', detail: ['LOCKED', 'DISBURSED'].includes(status) ? 'Finalized' : status.replaceAll('_', ' ').toLowerCase(), href: runId ? `/payroll/${runId}` : null },
    { name: 'Disbursed', detail: status === 'DISBURSED' ? 'Payment recorded' : 'Confirm payment after locking', href: runId ? `/payroll/${runId}` : null },
  ]
  return <nav aria-label="Payroll workflow" className="grid grid-cols-2 lg:grid-cols-4 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
    {steps.map((step, index) => {
      const content = <><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${index === current ? 'bg-[#ff5900] text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span><span><span className="block text-xs sm:text-sm font-medium text-[#162d54]">{step.name}</span><span className="mt-1 hidden sm:block text-xs text-slate-500">{step.detail}</span></span></>
      const style = `flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-r border-slate-100 ${index === current ? 'bg-orange-50/70' : ''}`
      return step.href ? <Link key={step.name} href={step.href} aria-current={index === current ? 'step' : undefined} className={`${style} hover:bg-slate-50`}>{content}</Link> : <div key={step.name} aria-current={index === current ? 'step' : undefined} className={style}>{content}</div>
    })}
  </nav>
}
