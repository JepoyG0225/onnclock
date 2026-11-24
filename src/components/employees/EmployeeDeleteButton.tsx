'use client'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'

export function EmployeeDeleteButton({ employeeId, isActive, employeeName }: { employeeId: string; isActive: boolean; employeeName: string }) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<'inactive' | 'permanent'>(isActive ? 'inactive' : 'permanent')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const router = useRouter()
  async function submit() {
    if (locked.current || (action === 'permanent' && confirmation !== 'DELETE')) return
    locked.current = true; setBusy(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, confirmation }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unable to update employee.')
      toast.success(action === 'permanent' ? 'Employee permanently deleted' : 'Employee marked inactive')
      setOpen(false); router.refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update employee. Please try again.') }
    finally { locked.current = false; setBusy(false) }
  }
  return <span onClick={event => event.stopPropagation()}>
    <PermissionGate permission="employees:delete"><Button size="icon-sm" variant="destructive" aria-label={`Delete ${employeeName}`} title="Delete employee" onClick={() => { setAction(isActive ? 'inactive' : 'permanent'); setConfirmation(''); setOpen(true) }}><Trash2 className="h-4 w-4" /></Button></PermissionGate>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}><DialogContent>
      <DialogHeader><DialogTitle>{isActive ? 'Remove employee' : 'Delete employee permanently'}</DialogTitle></DialogHeader>
      <div className="space-y-4 text-sm"><p className="font-semibold">{employeeName}</p>
        {isActive && <fieldset className="space-y-2" disabled={busy}><legend className="sr-only">Choose action</legend>
          <label className="flex gap-3 rounded-lg border p-3"><input type="radio" name={`delete-${employeeId}`} checked={action === 'inactive'} onChange={() => setAction('inactive')} /><span><strong>Make inactive</strong><span className="mt-1 block text-slate-600">Keep employee records and history. You can reactivate the employee later.</span></span></label>
          <label className="flex gap-3 rounded-lg border p-3"><input type="radio" name={`delete-${employeeId}`} checked={action === 'permanent'} onChange={() => setAction('permanent')} /><span><strong>Delete permanently</strong><span className="mt-1 block text-slate-600">Remove the employee and linked records. This cannot be undone.</span></span></label>
        </fieldset>}
        {action === 'permanent' && <><p className="rounded-lg bg-red-50 p-3 text-red-700">This permanently deletes their profile and linked attendance, payroll, leave, loan, expense and learning records. Payroll totals will change. This cannot be restored from the Inactive list.</p><label className="block">Type <strong>DELETE</strong> to confirm<Input aria-label="Type DELETE to confirm permanent deletion" value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} className="mt-2" autoComplete="off" /></label></>}
        <div className="flex justify-center gap-2"><PermissionGate permission="employees:delete"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button></PermissionGate><PermissionGate permission="employees:delete"><Button variant={action === 'permanent' ? 'destructive' : 'default'} disabled={busy || (action === 'permanent' && confirmation !== 'DELETE')} onClick={submit}>{busy ? 'Saving...' : action === 'permanent' ? 'Delete permanently' : 'Make inactive'}</Button></PermissionGate></div>
      </div>
    </DialogContent></Dialog>
  </span>
}
