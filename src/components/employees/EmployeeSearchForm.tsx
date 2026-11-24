'use client'

import { useEffect, useRef, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export function EmployeeSearchForm({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composing = useRef(false)
  const [pending, startTransition] = useTransition()
  const cancel = () => { if (timer.current) clearTimeout(timer.current) }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const search = (form: HTMLFormElement) => {
    cancel()
    const params = new URLSearchParams()
    for (const [key, value] of new FormData(form)) {
      if (typeof value === 'string' && value.trim()) params.set(key, value.trim())
    }
    // A new search always starts on page one, preserving the selected filters.
    params.delete('page')
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
  }
  const schedule = (form: HTMLFormElement) => {
    cancel()
    if (!composing.current) timer.current = setTimeout(() => search(form), 300)
  }
  return <form className="flex flex-wrap gap-3" data-tour="employee-filters" aria-busy={pending}
    onSubmit={event => { event.preventDefault(); search(event.currentTarget) }}
    onChange={event => {
      if (event.target instanceof HTMLInputElement && event.target.name === 'search') schedule(event.currentTarget)
    }}
    onCompositionStart={() => { composing.current = true; cancel() }}
    onCompositionEnd={event => { composing.current = false; schedule(event.currentTarget) }}>
    {children}
    <span role="status" className="sr-only">{pending ? 'Searching employees...' : ''}</span>
  </form>
}
