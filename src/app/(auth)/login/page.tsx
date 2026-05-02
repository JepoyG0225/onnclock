'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { toast } from 'sonner'
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        email,
        password,
        loginType: 'admin',
        redirect: false,
      })
      if (result?.error) {
        toast.error('Invalid email or password')
        setLoading(false)
        return
      }
      // Hard redirect  middleware will route EMPLOYEE ? /portal, others ? /dashboard
      window.location.href = '/dashboard'
    } catch {
      toast.error('An unexpected error occurred.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Welcome back</h2>
        <p className="text-sm text-slate-400 mt-1">Sign in to your company workspace</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all bg-slate-50 border-2 border-slate-200 text-slate-900 placeholder:text-slate-300 focus:bg-white focus:border-[#2E4156] focus:ring-4 focus:ring-[#2E4156]/10"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-semibold" style={{ color: '#2E4156' }}>
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="********"
              required
              autoComplete="current-password"
              className="w-full pl-10 pr-11 py-3 rounded-xl text-sm font-medium outline-none transition-all bg-slate-50 border-2 border-slate-200 text-slate-900 placeholder:text-slate-300 focus:bg-white focus:border-[#2E4156] focus:ring-4 focus:ring-[#2E4156]/10"
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-xl text-sm font-black tracking-wide text-white transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          style={{
            background: 'linear-gradient(135deg, #2E4156, #1A2D42)',
            boxShadow: '0 6px 20px rgba(34,127,132,0.35)',
          }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Signing in...
            </>
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-100" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-slate-400">New to Onclock?</span>
        </div>
      </div>

      <Link
        href="/register"
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:border-[#2E4156] hover:text-[#1A2D42] hover:bg-[#D4D8DD] transition-all"
      >
        Create a free company account
      </Link>

      <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'rgba(34,127,132,0.06)' }}>
        <p className="text-xs text-[#1A2D42] font-semibold">7-day free trial | No credit card needed</p>
      </div>

      <div className="rounded-xl border border-slate-200 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-500 text-center uppercase tracking-wide">Download Desktop App</p>
        <a
          href="/download"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#2E4156] hover:text-[#1A2D42] transition-colors"
        >
          <Image src="/platform-icons/windows.svg" alt="Windows" width={14} height={14} />
          <Image src="/platform-icons/mac-21.png" alt="macOS" width={14} height={14} />
          Download Desktop Apps
        </a>
      </div>
    </div>
  )
}
