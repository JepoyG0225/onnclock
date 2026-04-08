'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Calculator, Loader2 } from 'lucide-react'

export function ComputePayrollButton({ runId }: { runId: string }) {
  const [computing, setComputing] = useState(false)
  const router = useRouter()

  async function handleCompute() {
    setComputing(true)
    try {
      const res = await fetch(`/api/payroll/${runId}/compute`, {
        method: 'POST',
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Computation failed')
        return
      }

      const result = await res.json()
      toast.success(`Payroll computed for ${result.employeeCount} employees!`)
      router.refresh()
    } catch {
      toast.error('An error occurred during computation')
    } finally {
      setComputing(false)
    }
  }

  return (
    <Button onClick={handleCompute} disabled={computing}>
      {computing ? (
        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Computing...</>
      ) : (
        <><Calculator className="mr-2 h-4 w-4" /> Compute Payroll</>
      )}
    </Button>
  )
}
