import Image from 'next/image'
import AuthLeftPanel from './auth-left-panel'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">

      {/* ── LEFT PANEL (animated phone) ─────────────────────────── */}
      <AuthLeftPanel />

      {/* ── RIGHT PANEL (FORM) ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white overflow-y-auto">
        <div className="flex flex-col items-center justify-center min-h-full px-8 py-10">

          {/* Mobile-only logo */}
          <div className="lg:hidden mb-8 text-center">
            <Image src="/onclock-login.png" alt="Onclock" width={180} height={58} className="mx-auto" />
            <p className="text-xs text-slate-400 mt-2">Philippine HR &amp; Payroll Management</p>
          </div>

          {/* Form card */}
          <div className="w-full max-w-sm">
            {children}
          </div>

          {/* Compliance footer */}
          <p className="text-center text-slate-300 text-xs mt-8 font-medium">
            DOLE · BIR · SSS · PhilHealth · Pag-IBIG Compliant
          </p>
        </div>
      </div>

    </div>
  )
}
