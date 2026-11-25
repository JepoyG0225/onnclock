'use client'
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
    <Button size="sm" variant="outline" className={revert ? 'h-8 w-8 p-0' : undefined} title={revert ? 'Revert payment' : undefined} aria-label={revert ? 'Revert payment' : undefined} onClick={() => setConfirming(!confirming)}>{revert ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : 'Mark paid'}</Button>
    <Dialog open={confirming} onOpenChange={open => { if (!busy) setConfirming(open) }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-2xl p-6 sm:p-8">
        <DialogHeader><DialogTitle>{revert ? 'Revert payment' : 'Mark as fully paid'}</DialogTitle></DialogHeader>
        <div role="alertdialog" aria-label={revert ? 'Confirm payment reversal' : 'Confirm full payment'} className="space-y-5 text-left">
          <p className="text-sm leading-relaxed text-slate-600">{revert ? 'Restore the outstanding balance saved before this loan or cash advance was marked fully paid?' : 'Confirm that the remaining balance of this loan or cash advance has been fully paid.'}</p>
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
            <p className="text-xs font-medium text-slate-600">{revert ? 'Balance to restore' : 'Remaining balance'}</p>
            <p className="mt-1 text-2xl font-semibold text-[#162d54]">{peso(amount)}</p>
          </div>
          <p className="text-sm leading-relaxed text-slate-500">{revert ? 'Payroll deductions will resume. Existing payslips are unchanged.' : 'This stops future deductions. You can revert to this exact balance if marked paid by mistake.'}</p>
          <div className="flex justify-end gap-3 pt-1"><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button><Button disabled={busy} onClick={submit}>{busy ? 'Saving...' : revert ? 'Revert payment' : 'Confirm full payment'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </div></PermissionGate>
}
