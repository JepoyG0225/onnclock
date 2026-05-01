import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/desktop-app/download
 *
 * Redirects to the OnClock Desktop installer binary.
 * Set DESKTOP_INSTALLER_URL on Vercel to the actual hosted .exe download link.
 * Examples:
 *   - Google Drive direct link
 *   - Dropbox ?dl=1 link
 *   - GitHub Release asset URL
 *   - Any direct .exe URL
 */
export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform')?.toLowerCase()
  const url =
    platform === 'mac'
      ? process.env.DESKTOP_INSTALLER_URL_MAC || process.env.DESKTOP_INSTALLER_URL
      : process.env.DESKTOP_INSTALLER_URL

  if (!url) {
    return new NextResponse(
      JSON.stringify({ error: 'Installer not configured. Set DESKTOP_INSTALLER_URL (and optional DESKTOP_INSTALLER_URL_MAC) on the server.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return NextResponse.redirect(url, { status: 302 })
}
