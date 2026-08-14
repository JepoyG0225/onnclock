'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export function ProcessPayrollButton({ runId }: { runId: string }) {
  const router = useRouter()
  const [clicked, setClicked] = useState(false)
  const [isPending, startTransition] = useTransition()
  const processing = clicked || isPending

  function processPayroll() {
    if (processing) return
    setClicked(true)
    startTransition(() => router.push(`/payroll/${runId}`))
  }

  return (
    <button
      type="button"
      onClick={processPayroll}
      disabled={processing}
      aria-busy={processing}
      className="relative inline-flex min-w-[150px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-100"
    >
      {processing && <span className="absolute inset-0 animate-pulse bg-white/10" />}
      <span className="relative inline-flex items-center gap-2">
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? 'Processing payroll…' : 'Process Payroll'}
      </span>
    </button>
  )
}
