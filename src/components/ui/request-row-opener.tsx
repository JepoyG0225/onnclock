'use client'

import { useState, type ReactNode } from 'react'

/**
 * Generic click-to-open wrapper for a request-list <tr>. The list page
 * provides:
 *   • `children` — the row's normal table cells, server-rendered
 *   • `renderDialog(open, onClose)` — slot for the type-specific detail
 *     dialog. Called only after the row is clicked at least once so
 *     dialogs stay lazy if the user never opens them.
 *
 * Why a slot instead of a `dialog` prop: lets each list page pass full
 * server-resolved data into its dialog component without prop-drilling
 * through this wrapper.
 *
 * Usage:
 *
 *   <RequestRowOpener
 *     renderDialog={(open, onClose) => (
 *       <BudgetReqDetailDialog open={open} onClose={onClose} request={req} ... />
 *     )}
 *   >
 *     <td>{req.title}</td>
 *     <td>{peso(req.totalAmount)}</td>
 *     ...
 *   </RequestRowOpener>
 */
export function RequestRowOpener({
  children,
  renderDialog,
}: {
  children: ReactNode
  renderDialog: (open: boolean, onClose: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-slate-50 focus-within:bg-slate-50"
        onClick={() => setOpen(true)}
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
      {renderDialog(open, () => setOpen(false))}
    </>
  )
}
