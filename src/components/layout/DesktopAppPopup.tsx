'use client'

import { useState, useRef, useEffect } from 'react'
import { Monitor, X, Download } from 'lucide-react'

const PLATFORMS = [
  { key: 'windows', label: 'Windows', icon: '🪟', href: '/api/desktop-app/download/admin/windows' },
  { key: 'mac',     label: 'macOS',   icon: '🍎', href: '/api/desktop-app/download/admin/mac' },
]

export function DesktopAppPopup() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Hide when running inside the Electron desktop app
  const isElectron = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)
  if (isElectron) return null

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-[#000000] transition-colors"
        title="Download Desktop App"
      >
        <Monitor className="w-3.5 h-3.5" />
        Desktop App
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.14)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b"
            style={{ background: '#000000' }}>
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-white/80" />
              <p className="text-sm font-bold text-white">Desktop App</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Platform links */}
          <div className="p-3 space-y-2">
            {PLATFORMS.map(platform => (
              <a
                key={platform.key}
                href={platform.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-100 hover:bg-orange-50 hover:border-orange-100 transition-colors group"
              >
                <span className="flex items-center gap-2 text-sm text-gray-700 group-hover:text-[#000000] font-medium">
                  <span className="text-base">{platform.icon}</span>
                  {platform.label}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-500 group-hover:text-orange-600">
                  <Download className="w-3 h-3" />
                  Download
                </span>
              </a>
            ))}
          </div>

          <p className="text-[10px] text-gray-400 text-center pb-3">
            OnClock Desktop · onclockph.com
          </p>
        </div>
      )}
    </div>
  )
}
