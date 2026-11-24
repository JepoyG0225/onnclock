import Link from 'next/link'

export function PayrollJourney({ runId, status = 'DRAFT', stage = 'setup' }: { runId?: string; status?: string; stage?: 'setup' | 'review' | 'approval' }) {
  const current = status === 'DISBURSED' ? 3 : stage === 'setup' ? 0 : stage === 'review' ? 1 : 2
  const steps = [
    { name: 'Setup', detail: 'Period and employees', href: runId ? `/payroll/new?runId=${runId}` : null },
    { name: 'Calculate & Review', detail: 'Check pay and deductions', href: runId ? `/payroll/${runId}?stage=inputs` : null },
    { name: 'Approval', detail: ['LOCKED', 'DISBURSED'].includes(status) ? 'Finalized' : status.replaceAll('_', ' ').toLowerCase(), href: runId ? `/payroll/${runId}` : null },
    { name: 'Disbursed', detail: status === 'DISBURSED' ? 'Payment recorded' : 'Confirm payment after locking', href: runId ? `/payroll/${runId}` : null },
  ]
  return <nav aria-label="Payroll workflow" className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border bg-white overflow-hidden">
    {steps.map((step, index) => {
      const content = <><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${index === current ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span><span><span className="block text-sm font-semibold">{step.name}</span><span className="block text-xs text-slate-500">{step.detail}</span></span></>
      const style = `flex items-center gap-3 p-4 border-b border-r ${index === current ? 'bg-blue-50' : ''}`
      return step.href ? <Link key={step.name} href={step.href} aria-current={index === current ? 'step' : undefined} className={`${style} hover:bg-slate-50`}>{content}</Link> : <div key={step.name} aria-current={index === current ? 'step' : undefined} className={style}>{content}</div>
    })}
  </nav>
}
