'use client'

import { useRouter } from 'next/navigation'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'

export function ClickablePayrollRunRow({ runId, children }: { runId: string; children: ReactNode }) {
  const router = useRouter()
  const href = `/payroll/${runId}`
  const isInteractive = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('a, button, input, select, textarea, [role="dialog"], [role="menu"]'))

  function openRun(event: MouseEvent<HTMLTableRowElement>) {
    if (!isInteractive(event.target)) router.push(href)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if ((event.key === 'Enter' || event.key === ' ') && !isInteractive(event.target)) {
      event.preventDefault()
      router.push(href)
    }
  }

  return (
    <tr
      className="cursor-pointer border-b transition-colors hover:bg-blue-50/60 focus-visible:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
      onClick={openRun}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
    >
      {children}
    </tr>
  )
}
