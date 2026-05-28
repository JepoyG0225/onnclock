'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    // Redirect to login when running inside the Electron desktop app
    if (/electron/i.test(navigator.userAgent)) {
      router.replace('/login')
    }
  }, [router])

  // Render nothing until the redirect fires in Electron;
  // in a real browser this useEffect runs once and does nothing.
  if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)) {
    return null
  }

  return <>{children}</>
}
