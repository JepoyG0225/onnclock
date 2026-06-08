'use client'

import { Check } from 'lucide-react'

const STEPS = [
  { key: 'DRAFT',        label: 'Draft' },
  { key: 'COMPUTED',     label: 'Computed' },
  { key: 'FOR_APPROVAL', label: 'For Approval' },
  { key: 'APPROVED',     label: 'Approved' },
  { key: 'LOCKED',       label: 'Locked' },
] as const

const STATUS_ORDER: Record<string, number> = {
  DRAFT: 0,
  COMPUTED: 1,
  FOR_APPROVAL: 2,
  APPROVED: 3,
  LOCKED: 4,
  CANCELLED: -1,
}

/**
 * Tiny pipeline indicator shown under the page header. Mirrors the
 * payroll-run state machine (Draft → Computed → For Approval → Approved
 * → Locked) so HR always sees where the run is and what comes next at a
 * glance.
 *
 * Cancelled runs collapse to a single danger pill rather than rendering
 * the empty pipeline.
 */
export function PayrollWorkflowStepper({ status }: { status: string }) {
  if (status === 'CANCELLED') {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Cancelled
      </div>
    )
  }

  const currentIdx = STATUS_ORDER[status] ?? 0

  return (
    <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
      {STEPS.map((step, idx) => {
        const isComplete = idx < currentIdx
        const isCurrent  = idx === currentIdx

        const dotClass = isComplete
          ? 'bg-emerald-500 text-white border-emerald-500'
          : isCurrent
            ? 'bg-[#ff5900] text-white border-[#ff5900] ring-4 ring-[#ff5900]/15'
            : 'bg-white text-slate-400 border-slate-300'

        const labelClass = isCurrent
          ? 'text-[#ff5900] font-semibold'
          : isComplete
            ? 'text-slate-600'
            : 'text-slate-400'

        const connectorClass = idx < STEPS.length - 1
          ? isComplete
            ? 'bg-emerald-400'
            : 'bg-slate-200'
          : ''

        return (
          <li key={step.key} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 text-[10px] font-bold transition-colors ${dotClass}`}
              >
                {isComplete ? <Check className="w-3 h-3" strokeWidth={3} /> : idx + 1}
              </span>
              <span className={`text-xs whitespace-nowrap ${labelClass}`}>{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <span className={`hidden sm:block h-0.5 w-6 rounded ${connectorClass}`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
