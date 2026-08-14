'use client'

/**
 * Employee portal sign-in.
 *
 * This screen renders inside the Capacitor WebView as well as the browser, so
 * it is built mobile-first and pads for the iOS notch and home indicator via
 * env(safe-area-inset-*). Without that the card sat under the status bar on
 * a notched device.
 *
 * All behaviour from the previous version is preserved: per-host company
 * branding, the Android PWA install prompt, the desktop download block, and
 * the hard redirect after sign-in.
 */
import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

interface CompanyInfo {
  name: string
  logoUrl: string | null
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PortalLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installReady, setInstallReady] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    setIsStandalone(standalone)

    const ua = navigator.userAgent || navigator.vendor
    setIsIos(/iphone|ipad|ipod/i.test(ua))
    setIsAndroid(/android/i.test(ua))

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setInstallReady(true)
    }

    const handleInstalled = () => {
      setInstallPrompt(null)
      setInstallReady(false)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadCompany() {
      try {
        const res = await fetch('/api/companies/by-host')
        const data = await res.json()
        if (active) setCompany(data.company ?? null)
      } catch {
        // silent
      }
    }

    loadCompany()
    return () => {
      active = false
    }
  }, [])

  async function handleInstall() {
    if (!installPrompt) {
      toast.error('Install prompt is not ready yet. Wait a moment and try again.')
      return
    }

    installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)
    setInstallReady(false)

    if (choice.outcome === 'accepted') {
      toast.success('App installation started')
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        loginType: 'portal',
        redirect: false,
      })
      if (result?.error || !result?.ok) {
        toast.error('Invalid email or password')
        return
      }
      document.cookie = 'portal_session=1; path=/; SameSite=Lax'
      // Hard redirect — ensures the browser sends the new session cookie in a
      // full HTTP request so the server-side auth() call in the layout can
      // read it. router.push() with router.refresh() can race against the
      // Set-Cookie being committed, causing an auth loop.
      //
      // Lands on /portal (the home screen) rather than /portal/clock, which is
      // what this redirected to before there was a home.
      window.location.assign('/portal')
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const hasCompanyLogo = !!company?.logoUrl

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        // Existing brand gradient, kept as-is. What changed is only the
        // layering: the repeating grid overlay and the two blurred blobs are
        // gone, since they read as busy behind a form this small.
        background:
          'radial-gradient(1200px 700px at -10% -15%, rgba(184, 225, 0,0.24), transparent 55%), radial-gradient(900px 600px at 110% 115%, rgba(59,130,246,0.18), transparent 60%), linear-gradient(155deg, #0f1a2b 0%, #000000 45%, #223a56 100%)',
        paddingTop:    'max(env(safe-area-inset-top), 24px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
        paddingLeft:   'max(env(safe-area-inset-left), 16px)',
        paddingRight:  'max(env(safe-area-inset-right), 16px)',
      }}
    >
      <div className="relative w-full max-w-[400px]">

        {/* Brand */}
        <div className="text-center mb-7">
          {hasCompanyLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company!.logoUrl!}
              alt={company!.name}
              className="h-11 w-auto mx-auto mb-3 object-contain"
            />
          ) : (
            <Image
              src="/onclock-login.png"
              alt="Onclock"
              width={168}
              height={58}
              priority
              className="mx-auto mb-3 drop-shadow-xl"
            />
          )}
          <p className="text-[13px] text-white/55 font-semibold tracking-wide">
            {company?.name ? `${company.name} · Employee Portal` : 'Employee Portal'}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-[28px] bg-white shadow-2xl shadow-black/30 overflow-hidden">
          <form onSubmit={handleLogin} className="px-6 py-7 sm:px-8 space-y-5">
            <div>
              <h1 className="text-[22px] font-black tracking-tight" style={{ color: '#000000' }}>
                Welcome back
              </h1>
              <p className="text-[13px] text-slate-500 mt-1">
                Sign in with your employee account
              </p>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="portal-email" className="block text-[11px] font-black uppercase tracking-wider text-slate-500">
                Email
              </label>
              {/* focus-within on the wrapper drives the ring, so the visual
                  focus state is plain CSS rather than the onFocus/onBlur inline
                  style mutation this used to do — which never showed a ring for
                  keyboard users and fought the browser's own styling. */}
              <div className="relative flex items-center rounded-2xl bg-slate-50 border-2 border-slate-200 transition-all focus-within:border-[#000000] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#000000]/12">
                <Mail className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  id="portal-email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full bg-transparent pl-10 pr-4 py-3.5 rounded-2xl text-[15px] font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="portal-password" className="block text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Password
                </label>
                {/* The portal had no route out of a forgotten password, even
                    though /forgot-password already existed. */}
                <Link
                  href="/forgot-password"
                  className="text-[11px] font-bold text-slate-500 hover:text-[#000000] transition-colors"
                >
                  Forgot?
                </Link>
              </div>
              <div className="relative flex items-center rounded-2xl bg-slate-50 border-2 border-slate-200 transition-all focus-within:border-[#000000] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#000000]/12">
                <Lock className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  id="portal-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="w-full bg-transparent pl-10 pr-12 py-3.5 rounded-2xl text-[15px] font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                />
                {/* Typing a password blind on a phone keyboard is the single
                    biggest cause of failed sign-ins on mobile. */}
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group w-full py-4 rounded-2xl text-[15px] font-black tracking-wide text-white transition-all active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #000000, #1b6a6e)',
                boxShadow: '0 8px 24px rgba(34,127,132,0.35)',
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          {/* Secondary actions live outside the form, on a tinted footer, so
              they read as separate from the sign-in action rather than as
              another field in it. */}
          {(!isIos && !isAndroid) || (!isStandalone && isAndroid) ? (
            <div className="px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-100">
              {!isIos && !isAndroid && (
                <a
                  href="/download#employee"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] font-bold text-slate-600 hover:border-[#000000] hover:text-[#000000] transition-colors"
                >
                  <Image src="/platform-icons/windows.svg" alt="" width={14} height={14} />
                  <Image src="/platform-icons/mac-21.png" alt="" width={14} height={14} />
                  Download the desktop app
                </a>
              )}

              {!isStandalone && isAndroid && (
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={!installReady}
                  className="w-full py-3 rounded-xl text-[13px] font-bold border-2 border-slate-300 text-slate-700 bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {installReady ? 'Install app on this device' : 'Preparing install…'}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* "Powered by" only when the company has its own branding. Showing the
            Onclock mark here as well as at the top duplicated the same logo
            twice on one screen for every unbranded tenant. */}
        {hasCompanyLogo && (
          <div className="text-center mt-6">
            <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em] mb-2">
              Powered by
            </p>
            <Image
              src="/onclock-login.png"
              alt="Onclock"
              width={112}
              height={38}
              className="mx-auto opacity-70"
            />
          </div>
        )}
      </div>
    </div>
  )
}
