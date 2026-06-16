'use client'

import { useState, type ReactNode } from 'react'

/**
 * Card-shaped sibling of <RequestRowOpener>. Used by list pages that
 * render request rows as Cards instead of <tr>'s (overtime requests).
 *
 * The wrapper itself is a focusable, keyboard-activatable button — the
 * caller supplies the visual card chrome via `children`. `renderDialog`
 * is rendered next to the card and stays unmounted until first click,
 * matching the lazy pattern in the row variant.
 */
export function RequestCardOpener({
  children,
  renderDialog,
  className = '',
}: {
  children: ReactNode
  renderDialog: (open: boolean, onClose: () => void) => ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div
        className={`cursor-pointer transition-colors hover:bg-slate-50/60 focus-within:bg-slate-50/60 rounded-xl ${className}`}
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
      </div>
      {renderDialog(open, () => setOpen(false))}
    </>
  )
}
