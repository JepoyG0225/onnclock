import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Download OnClock Desktop',
  description: 'Install the OnClock Desktop app for Windows to enable screen activity monitoring while clocked in.',
}

export default function DesktopDownloadPage() {
  const version = process.env.NEXT_PUBLIC_DESKTOP_APP_VERSION || '1.1.5'
  const hasInstaller = !!process.env.DESKTOP_INSTALLER_URL

  return (
    <div className="min-h-screen bg-[#eef2f7] flex flex-col items-center justify-center p-6">
      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">

        {/* Header band */}
        <div className="bg-gradient-to-r from-[#0d1b2a] to-[#1a2d42] px-8 py-7 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-[#fa5e01] flex items-center justify-center flex-shrink-0 shadow-lg">
            {/* Monitor icon */}
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">OnClock Desktop</h1>
            <p className="text-sm text-white/60 mt-0.5">Windows Activity Monitor · v{version}</p>
          </div>
        </div>

        <div className="px-8 py-6 space-y-5">
          {/* Description */}
          <p className="text-sm text-gray-600 leading-relaxed">
            The OnClock Desktop app runs silently in the background while you&apos;re clocked in, capturing
            periodic screenshots so your team lead can verify remote work activity.
          </p>

          {/* Feature list */}
          <ul className="space-y-2.5">
            {[
              ['📸', 'Periodic screen captures while clocked in'],
              ['📍', 'GPS location tracking on the live map'],
              ['☕', 'Break mode — pauses monitoring automatically'],
              ['🔒', 'Runs quietly in the system tray'],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className="text-base leading-5 flex-shrink-0">{icon}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>

          {/* Requirements */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-xs text-gray-500 space-y-1">
            <p className="font-semibold text-gray-600">Requirements</p>
            <p>Windows 10 / 11 &nbsp;·&nbsp; 64-bit &nbsp;·&nbsp; Internet connection</p>
          </div>

          {/* Download button */}
          {hasInstaller ? (
            <a
              href="/api/desktop-app/download"
              className="flex items-center justify-center gap-2.5 w-full bg-[#fa5e01] hover:bg-[#c44d00] text-white font-bold text-sm py-3.5 rounded-xl transition-colors shadow-md"
            >
              {/* Download icon */}
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2v11M5 9l5 5 5-5" /><path d="M3 17h14" />
              </svg>
              Download for Windows (64-bit)
            </a>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <p className="font-semibold">Installer not available yet</p>
              <p className="text-xs mt-1 text-amber-600">
                The administrator has not configured the download link. Please contact your HR team for the installer file.
              </p>
            </div>
          )}

          {/* Installation steps */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">How to install</p>
            <ol className="space-y-1.5 text-xs text-gray-600">
              <li className="flex gap-2"><span className="font-bold text-[#fa5e01] flex-shrink-0">1.</span> Download and run the installer above</li>
              <li className="flex gap-2"><span className="font-bold text-[#fa5e01] flex-shrink-0">2.</span> OnClock Desktop installs silently and opens automatically</li>
              <li className="flex gap-2"><span className="font-bold text-[#fa5e01] flex-shrink-0">3.</span> Sign in with your OnClock email &amp; password</li>
              <li className="flex gap-2"><span className="font-bold text-[#fa5e01] flex-shrink-0">4.</span> Clock in from the app — monitoring starts automatically</li>
            </ol>
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-8 py-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">© {new Date().getFullYear()} OnClock PH</span>
          <Link href="/portal/login" className="text-xs font-semibold text-[#fa5e01] hover:underline">
            Open Portal →
          </Link>
        </div>
      </div>
    </div>
  )
}
