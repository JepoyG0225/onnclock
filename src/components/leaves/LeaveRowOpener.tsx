'use client'

import { useState, type ReactNode } from 'react'
import { LeaveRequestDetailDialog, type LeaveDetailDialogProps } from '@/components/leaves/LeaveRequestDetailDialog'

/**
 * Click-to-open wrapper for a leave-request <tr>. Renders its children
 * inside a `<tr>` that opens the LeaveRequestDetailDialog on click.
 *
 * The server-rendered leaves page renders the cells as children; this
 * client component is only responsible for two things:
 *
 *   1. Holding the dialog's open/close state.
 *   2. Letting the user click anywhere on the row to open the dialog
 *      while still allowing nested interactive elements (e.g. a future
 *      attachments button) to stop propagation if they want their own
 *      click semantics.
 */
type WrapperProps = Omit<LeaveDetailDialogProps, 'open' | 'onClose'> & {
  children: ReactNode
}

export function LeaveRowOpener({
  request,
  canApprove,
  approveDisabledReason,
  isHR,
  children,
}: WrapperProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-slate-50 focus-within:bg-slate-50"
        onClick={() => setOpen(true)}
        // Keyboard accessibility — Enter or Space on the row opens the dialog.
        tabIndex={0}
        role="button"
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {children}
      </tr>
      <LeaveRequestDetailDialog
        open={open}
        onClose={() => setOpen(false)}
        request={request}
        canApprove={canApprove}
        approveDisabledReason={approveDisabledReason}
        isHR={isHR}
      />
    </>
  )
}
