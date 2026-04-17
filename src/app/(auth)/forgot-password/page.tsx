'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      // Always show success to avoid leaking email existence
      setSent(true)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,127,132,0.1)' }}>
            <CheckCircle className="w-8 h-8" style={{ color: '#2E4156' }} />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">Check your email</h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            If an account exists for <strong className="text-slate-600">{email}</strong>, we&apos;ve sent a password reset link. Check your inbox (and spam folder).
          </p>
        </div>
        <p className="text-xs text-slate-400">The link expires in 1 hour.</p>
        <Link
          href="/login"
          className="flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ color: '#2E4156' }}
        >
          <ArrowLeft className="w-4 h-4" /> Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Forgot password?</h2>
        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-xl text-sm font-black tracking-wide text-white transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          style={{
            background: 'linear-gradient(135deg, #2E4156, #1A2D42)',
            boxShadow: '0 6px 20px rgba(34,127,132,0.35)',
          }}
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : 'Send Reset Link'}
        </button>
      </form>

      <Link
        href="/login"
        className="flex items-center justify-center gap-2 text-sm font-semibold"
        style={{ color: '#2E4156' }}
      >
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </Link>
    </div>
  )
}

