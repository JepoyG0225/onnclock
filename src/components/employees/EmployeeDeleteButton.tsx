'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export function EmployeeDeleteButton({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const router = useRouter()
  const portalTarget = typeof document !== 'undefined' ? document.body : null

  async function handleDelete() {
    if (confirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm')
      return
    }
    const res = await fetch(`/api/employees/${employeeId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Employee deleted')
      setOpen(false)
      router.push('/employees')
      router.refresh()
    } else {
      toast.error('Failed to delete employee')
    }
  }

  return (
    <>
      <Button size="sm" variant="destructive" onClick={() => { setConfirmText(''); setOpen(true) }}>
        Delete
      </Button>
      {open && portalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <Card className="relative w-full max-w-md border-red-200 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-base text-red-600">Delete Employee</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                This will deactivate the employee. Type <strong>DELETE</strong> to confirm.
              </p>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      , portalTarget)}
    </>
  )
}
