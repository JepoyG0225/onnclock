import { NextResponse } from 'next/server'

function normalizeVersion(value: string | undefined): string {
  const v = String(value ?? '').trim()
  return /^\d+\.\d+\.\d+$/.test(v) ? v : ''
}

export async function GET() {
  const latestVersion =
    normalizeVersion(process.env.DESKTOP_APP_LATEST_VERSION) ||
    normalizeVersion(process.env.NEXT_PUBLIC_DESKTOP_APP_LATEST_VERSION) ||
    '1.1.11'

  const downloadUrl =
    process.env.DESKTOP_INSTALLER_URL
      ? '/api/desktop-app/download'
      : null

  return NextResponse.json({
    latestVersion,
    downloadUrl,
    notes: process.env.DESKTOP_APP_RELEASE_NOTES ?? null,
    checkedAt: new Date().toISOString(),
  })
}
