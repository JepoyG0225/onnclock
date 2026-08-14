'use client'

import { useRouter } from 'next/navigation'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'

export function ClickableEmployeeRow({ employeeId, children }: { employeeId: string; children: ReactNode }) {
  const router = useRouter()
  const href = `/employees/${employeeId}`

  function isInteractive(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest('a, button, input, select, textarea, [role="dialog"]'))
  }

  function openProfile(event: MouseEvent<HTMLTableRowElement>) {
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
      className="cursor-pointer border-b transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-highlight)]"
      onClick={openProfile}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
    >
      {children}
    </tr>
  )
}
