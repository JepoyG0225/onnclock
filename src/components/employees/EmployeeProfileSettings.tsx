'use client'

import { useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmployeePortalAccess } from '@/components/employees/EmployeePortalAccess'

export function EmployeeProfileSettings({
  employeeId,
  workEmail,
  personalEmail,
  hasUser,
}: {
  employeeId: string
  workEmail: string | null
  personalEmail: string | null
  hasUser: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline" aria-label="Employee settings" title="Employee settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="-mx-6 -mt-6 border-b border-blue-100 bg-blue-50 px-6 py-5">
          <DialogTitle className="!text-[var(--brand-ink)]">Employee Settings</DialogTitle>
        </DialogHeader>
        <EmployeePortalAccess
          employeeId={employeeId}
          workEmail={workEmail}
          personalEmail={personalEmail}
          hasUser={hasUser}
          editable
        />
      </DialogContent>
    </Dialog>
  )
}
