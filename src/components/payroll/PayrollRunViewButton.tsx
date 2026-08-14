'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Client-side wrapper around the per-row View link on the payroll list.
 *
 * The destination page (/payroll/[runId]) does several Prisma queries
 * server-side — PayrollRun, Company, ApproverConfig, Holiday, DTR rows
 * for every employee in the period, and every Payslip with its incomes
 * and employee detail. On a 50-employee run that round-trip can take a
 * few seconds, during which the table looked frozen with no feedback.
 *
 * Now the button immediately swaps to a spinner + "Loading…" the
 * instant the user clicks it. We drive navigation through useRouter +
 * useTransition so React owns the pending flag; the spinner stays up
 * until the new route's server components have finished streaming
 * (which is exactly when the row would visually change anyway).
 */
export function PayrollRunViewButton({ runId }: { runId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Click registered before transition kicks in — keep our own flag so
  // the spinner shows on the very first paint after click.
  const [clicked, setClicked] = useState(false)

  const loading = clicked || isPending

  function go() {
    if (loading) return
    setClicked(true)
    startTransition(() => {
      router.push(`/payroll/${runId}`)
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={go}
      disabled={loading}
      className="text-[#000000] hover:bg-[#dce5f7] hover:text-[#000000] disabled:opacity-100 disabled:cursor-progress"
      aria-busy={loading}
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          Loading…
        </>
      ) : (
        'View'
      )}
    </Button>
  )
}
