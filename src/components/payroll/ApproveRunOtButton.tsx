'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { CheckCheck, Loader2 } from 'lucide-react'

/**
 * One-click approval of all PENDING auto-OT requests in a run's pay period.
 * Auto-OT (generated from DTR overtime) stays PENDING until approved, and
 * payroll only pays APPROVED OT — so after approving here the user must
 * Recompute the run for the OT to be reflected in pay.
 */
export function ApproveRunOtButton({ runId }: { runId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function approve() {
    setLoading(true)
    try {
      const res = await fetch(`/api/payroll/${runId}/approve-ot`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Failed to approve overtime')
        return
      }
      if (data.approved > 0) {
        toast.success(`Approved ${data.approved} pending OT request${data.approved === 1 ? '' : 's'}. Recompute the run to apply it to pay.`)
        router.refresh()
      } else {
        toast.info('No pending overtime to approve for this period.')
      }
    } catch {
      toast.error('An error occurred while approving overtime')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={approve}
      disabled={loading}
      variant="outline"
      title="Approve all pending auto-generated overtime for this pay period, then Recompute to pay it"
    >
      {loading
        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving OT...</>
        : <><CheckCheck className="mr-2 h-4 w-4" /> Approve Pending OT</>}
    </Button>
  )
}
