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
    // Stepper now spans the available width so the connectors visually
    // chain the steps across the full header instead of bunching them
    // on the left. Each step keeps a fixed-width content cluster (dot +
    // label) and the connector between steps absorbs the leftover space
    // via flex-1 — that way labels stay legible while the line grows.
    <ol className="flex items-center w-full py-1">
      {STEPS.map((step, idx) => {
        const isComplete = idx < currentIdx
        const isCurrent  = idx === currentIdx

        const dotClass = isComplete
          ? 'border-[var(--brand-highlight)] bg-[var(--brand-highlight)] text-black'
          : isCurrent
            ? 'border-[var(--brand-highlight)] bg-[var(--brand-highlight)] text-black ring-4 ring-[var(--brand-highlight)]/20'
            : 'bg-white text-slate-400 border-slate-300'

        const labelClass = isCurrent
          ? 'font-semibold text-black'
          : isComplete
            ? 'text-black'
            : 'text-slate-400'

        const connectorClass = isComplete ? 'bg-[var(--brand-highlight)]' : 'bg-slate-200'

        return (
          <li
            key={step.key}
            className={`flex items-center ${idx < STEPS.length - 1 ? 'flex-1' : ''}`}
          >
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 text-[10px] font-bold transition-colors ${dotClass}`}
              >
                {isComplete ? <Check className="w-3 h-3" strokeWidth={3} /> : idx + 1}
              </span>
              <span className={`text-xs whitespace-nowrap ${labelClass}`}>{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <span className={`hidden sm:block flex-1 h-0.5 mx-2 rounded ${connectorClass}`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
