'use client'

import { useRouter } from 'next/navigation'
import { Eye, X } from 'lucide-react'
import { useState } from 'react'

export function ImpersonationBanner({ companyName }: { companyName: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function stopImpersonation() {
    setLoading(true)
    await fetch('/api/admin/impersonate', { method: 'DELETE' })
    router.push('/admin/companies')
    router.refresh()
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950">
      <Eye className="h-4 w-4 shrink-0" />
      <span>
        Viewing as <span className="underline underline-offset-2">{companyName}</span>
        {' '}— you are in admin preview mode
      </span>
      <button
        onClick={stopImpersonation}
        disabled={loading}
        className="ml-2 flex items-center gap-1 rounded-md bg-amber-950/15 px-2.5 py-1 text-xs font-bold transition hover:bg-amber-950/25 disabled:opacity-60"
      >
        <X className="h-3.5 w-3.5" />
        Exit Preview
      </button>
    </div>
  )
}
