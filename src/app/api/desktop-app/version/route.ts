import { NextResponse } from 'next/server'
import { resolveDesktopInstallerUrl } from '@/lib/desktop-download'

function normalizeVersion(value: string | undefined): string {
  const v = String(value ?? '').trim()
  return /^\d+\.\d+\.\d+$/.test(v) ? v : ''
}

export async function GET() {
  const latestVersion =
    normalizeVersion(process.env.DESKTOP_APP_LATEST_VERSION) ||
    normalizeVersion(process.env.NEXT_PUBLIC_DESKTOP_APP_LATEST_VERSION) ||
    '1.1.17'

  // Platform-specific download URLs (for the in-app auto-downloader)
  const winUrl  = resolveDesktopInstallerUrl('employee', 'windows')
  const macUrl  = resolveDesktopInstallerUrl('employee', 'mac')

  const downloadUrlWindows = winUrl  ? '/api/desktop-app/download/employee/windows' : null
  const downloadUrlMac     = macUrl  ? '/api/desktop-app/download/employee/mac'     : null
  // Generic fallback (backward-compat)
  const downloadUrl        = winUrl || macUrl ? '/api/desktop-app/download' : null

  return NextResponse.json({
    latestVersion,
    downloadUrl,
    downloadUrlWindows,
    downloadUrlMac,
    notes: process.env.DESKTOP_APP_RELEASE_NOTES ?? null,
    checkedAt: new Date().toISOString(),
  })
}
