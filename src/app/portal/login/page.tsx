'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, Mail, Lock } from 'lucide-react'
import Image from 'next/image'

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
      window.location.assign('/portal/clock')
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundImage: "url('/login-bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
    >
      <div className="relative w-full max-w-[420px]">
        <div className="text-center mb-6 space-y-2">
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={company.name}
              className="h-10 w-auto mx-auto"
            />
          ) : (
            <Image
              src="/onclock-login.png"
              alt="Onclock"
              width={200}
              height={70}
              priority
              className="drop-shadow-2xl mx-auto"
            />
          )}
          <p className="text-sm text-white/60 font-medium tracking-wide">
            {company?.name ? `${company.name} - Employee Portal` : 'Employee Portal'}
          </p>
        </div>

        <div
          className="rounded-3xl shadow-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)' }}
        >
          <form onSubmit={handleLogin} className="px-8 py-8 space-y-5">
            <div>
              <h2 className="text-xl font-black" style={{ color: '#2E4156' }}>Sign In</h2>
              <p className="text-sm text-slate-400 mt-0.5">Use your employee email and password</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#2E4156' }}>
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all border-2"
                  style={{ background: '#f8fafc', border: '2px solid #e2e8f0', color: '#2E4156' }}
                  onFocus={e => { e.target.style.borderColor = '#2E4156'; e.target.style.boxShadow = '0 0 0 4px rgba(46,65,86,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#2E4156' }}>
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="********"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all border-2"
                  style={{ background: '#f8fafc', border: '2px solid #e2e8f0', color: '#2E4156' }}
                  onFocus={e => { e.target.style.borderColor = '#2E4156'; e.target.style.boxShadow = '0 0 0 4px rgba(46,65,86,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-black tracking-wide text-white transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              style={{
                background: loading ? '#2E4156' : 'linear-gradient(135deg, #2E4156, #1b6a6e)',
                boxShadow: '0 6px 20px rgba(34,127,132,0.35)',
              }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            {!isStandalone && isAndroid && (
              <button
                type="button"
                onClick={handleInstall}
                disabled={!installReady}
                className="w-full py-3 rounded-xl text-sm font-bold border-2 transition-all disabled:cursor-not-allowed"
                style={{
                  borderColor: '#2E4156',
                  color: installReady ? '#2E4156' : '#6b7280',
                  background: installReady ? '#eef6f7' : '#f3f4f6',
                }}
              >
                {installReady ? 'Install App' : 'Preparing Install...'}
              </button>
            )}

            {!isStandalone && isIos && (
              <div
                className="rounded-xl border px-3 py-2 text-xs font-semibold text-slate-600"
                style={{ borderColor: '#dbe6e8', background: '#eef6f7' }}
              >
                Install on iPhone: tap <span className="font-bold">Share</span> then <span className="font-bold">Add to Home Screen</span>.
              </div>
            )}
          </form>
        </div>

        <div className="text-center mt-6">
          <p className="text-xs text-white/50 font-medium uppercase tracking-wider mb-2">Powered by</p>
          <Image
            src="/onclock-login.png"
            alt="Onclock"
            width={140}
            height={48}
            className="mx-auto opacity-90"
          />
        </div>
      </div>
    </div>
  )
}

