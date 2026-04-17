'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

const ALLOWED_PATHS = ['/settings/billing', '/billing/invoices']

interface Props {
  status: string
  trialEndsAt: string | null
  children: React.ReactNode
  bypassGate?: boolean
}

export function SubscriptionGate({ status, children, bypassGate }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const isExpired = !bypassGate && (status === 'EXPIRED' || status === 'CANCELLED')
  const isAllowed = ALLOWED_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (isExpired && !isAllowed) {
      router.replace('/settings/billing')
    }
  }, [isExpired, isAllowed, router])

  if (isExpired && !isAllowed) return null

  return <>{children}</>
}
