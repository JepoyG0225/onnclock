'use client'

import { useEffect } from 'react'

/**
 * Registers the portal service worker and keeps it fresh.
 *
 * Behavior:
 *   - Registers /sw.js once on mount
 *   - Calls registration.update() on visibility-change so a returning
 *     tab catches new deploys quickly (default browser auto-check is
 *     once per 24h, way too slow)
 *   - Also re-checks every 60 minutes for tabs that stay open
 *   - Auto-reloads the page when the SW reports a new version is
 *     active (`controllerchange` event), so users land on the latest
 *     build without manually refreshing
 */
export function PortalPwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null
    // Guard against double-reload loops (some browsers fire
    // controllerchange twice during update install).
    let reloading = false

    function maybeReload() {
      if (reloading) return
      reloading = true
      window.location.reload()
    }

    function checkForUpdate() {
      if (registration) {
        registration.update().catch(() => null)
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        registration = reg
        // Trigger one immediate check after registration (in case the
        // user has the page open since before a recent deploy).
        checkForUpdate()
      })
      .catch(() => null)

    // When the active SW changes (a new version took control via
    // skipWaiting + clients.claim), reload so the page picks up the
    // latest HTML/JS.
    navigator.serviceWorker.addEventListener('controllerchange', maybeReload)

    document.addEventListener('visibilitychange', onVisibility)
    intervalId = setInterval(checkForUpdate, 60 * 60 * 1000)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', maybeReload)
      document.removeEventListener('visibilitychange', onVisibility)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  return null
}
