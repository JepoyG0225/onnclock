import { NextResponse } from 'next/server'
import { DESKTOP_DOWNLOAD_ENV_HELP, resolveDesktopInstallerUrl } from '@/lib/desktop-download'

export async function GET() {
  const url = resolveDesktopInstallerUrl('employee', 'mac')
  if (!url) {
    return NextResponse.json({ error: DESKTOP_DOWNLOAD_ENV_HELP }, { status: 503 })
  }
  return NextResponse.redirect(url, { status: 302 })
}
