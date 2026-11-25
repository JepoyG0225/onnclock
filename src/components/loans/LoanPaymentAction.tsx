'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { peso } from '@/lib/utils'

export function LoanPaymentAction({ loan, onDone }: { loan: { id: string; status: string; balance: number | string; manualPaidBalance?: number | string | null }; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const revert = loan.status === 'FULLY_PAID'
  if (loan.status !== 'ACTIVE' && !(revert && loan.manualPaidBalance != null)) return null
  const amount = Number(revert ? loan.manualPaidBalance : loan.balance)
  async function submit() {
    setBusy(true)
    try {
      const res = await fetch(`/api/loans/${loan.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(revert ? { action: 'REVERT_PAID' } : { status: 'FULLY_PAID' }), confirmed: true, expectedBalance: amount }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to update payment')
      toast.success(revert ? `Restored outstanding balance: ${peso(amount)}` : 'Marked fully paid')
      setConfirming(false)
      onDone()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to update payment') }
    finally { setBusy(false) }
  }
  return <PermissionGate permission="loans:write"><div className="relative">
    <Button size="sm" variant="outline" onClick={() => setConfirming(!confirming)}>{revert ? 'Revert payment' : 'Mark paid'}</Button>
    {confirming && <div role="alertdialog" aria-label={revert ? 'Confirm payment reversal' : 'Confirm full payment'} className="mt-2 w-64 max-w-full rounded-xl border bg-white p-4 text-left shadow-xl">
      <p className="text-sm font-medium text-[#162d54]">{revert ? `Restore the previous balance of ${peso(amount)}?` : `Mark the remaining ${peso(amount)} as fully paid?`}</p>
      <p className="mt-2 text-xs text-slate-500">{revert ? 'Payroll deductions will resume. Existing payslips are unchanged.' : 'This stops future deductions. You can revert to this exact balance.'}</p>
      <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button><Button size="sm" disabled={busy} onClick={submit}>{busy ? 'Saving?' : 'Confirm'}</Button></div>
    </div>}
  </div></PermissionGate>
}
