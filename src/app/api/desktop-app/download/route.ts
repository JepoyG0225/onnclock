import { NextRequest, NextResponse } from 'next/server'
import { DESKTOP_DOWNLOAD_ENV_HELP, resolveDesktopInstallerUrl } from '@/lib/desktop-download'

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
  const role = req.nextUrl.searchParams.get('role')?.toLowerCase() === 'employee' ? 'employee' : 'admin'
  const platform = req.nextUrl.searchParams.get('platform')?.toLowerCase() === 'mac' ? 'mac' : 'windows'
  const url = resolveDesktopInstallerUrl(role, platform)

  if (!url) {
    return new NextResponse(
      JSON.stringify({ error: DESKTOP_DOWNLOAD_ENV_HELP }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return NextResponse.redirect(url, { status: 302 })
}
