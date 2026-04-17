'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Building2, User, Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle, Globe, ExternalLink } from 'lucide-react'

const PERKS = [
  '7-day free trial, no credit card required',
  'Automated payroll with BIR/SSS/PhilHealth',
  'Fingerprint clock-in & GPS geofencing',
]

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    companyName: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  })
  const [showPw,      setShowPw]      = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [success,     setSuccess]     = useState<{ portalUrl: string } | null>(null)
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.companyName,
          adminEmail: formData.email,
          adminPassword: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to create account'); return }
      const configuredBaseDomain = process.env.NEXT_PUBLIC_PORTAL_BASE_DOMAIN
      const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:'
      const host = configuredBaseDomain || (typeof window !== 'undefined' ? window.location.host : 'onclockph.com')
      setSuccess({ portalUrl: `${protocol}//${host}/portal` })
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full py-2.5 px-3.5 rounded-xl text-sm font-medium outline-none transition-all bg-slate-50 border-2 border-slate-200 text-slate-900 placeholder:text-slate-300 focus:bg-white focus:border-[#2E4156] focus:ring-4 focus:ring-[#2E4156]/10"
  // ── Success state ──────────────────────────────────────────────────
  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">You&apos;re all set!</h2>
          <p className="text-sm text-slate-400 mt-1">Your company workspace has been created.</p>
        </div>

        {success.portalUrl && (
          <div className="rounded-2xl border border-[#AAB7B7] bg-[#D4D8DD] p-4 text-left space-y-2">
            <p className="text-xs font-bold text-[#1A2D42] uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />Employee Portal URL
            </p>
            <p className="text-sm font-mono font-semibold text-[#1A2D42] break-all">{success.portalUrl}</p>
            <p className="text-xs text-[#2E4156]">Share this link with your employees so they can clock in, view payslips, and request leaves.</p>
            <a
              href={success.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1A2D42] hover:underline mt-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />Open portal
            </a>
          </div>
        )}

        <button
          onClick={() => router.push('/login')}
          className="w-full py-3.5 rounded-xl text-sm font-black tracking-wide text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #2E4156, #1A2D42)',
            boxShadow: '0 6px 20px rgba(34,127,132,0.35)',
          }}
        >
          <span>Sign in to your workspace</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // ── Registration form ──────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Start for free</h2>
        <p className="text-sm text-slate-400 mt-1">Set up your company workspace in 60 seconds</p>
      </div>

      <div className="space-y-1.5">
        {PERKS.map(p => (
          <div key={p} className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle className="w-3.5 h-3.5 text-[#2E4156] flex-shrink-0" />
            {p}
          </div>
        ))}
      </div>

      <form onSubmit={handleRegister} className="space-y-3.5">
        {/* Company Name */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Company Name</label>
          <div className="relative">
            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              name="companyName"
              placeholder="ABC Corporation"
              value={formData.companyName}
              onChange={handleChange}
              required
              className={`${inputCls} pl-10`}
            />
          </div>
        </div>

        {/* Name Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">First Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                name="firstName"
                placeholder="Juan"
                value={formData.firstName}
                onChange={handleChange}
                required
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Last Name</label>
            <input
              name="lastName"
              placeholder="dela Cruz"
              value={formData.lastName}
              onChange={handleChange}
              required
              className={inputCls}
            />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Work Email</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="email"
              name="email"
              placeholder="admin@company.com"
              value={formData.email}
              onChange={handleChange}
              required
              autoComplete="email"
              className={`${inputCls} pl-10`}
            />
          </div>
        </div>

        {/* Password Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type={showPw ? 'text' : 'password'}
                name="password"
                placeholder="Min. 8 chars"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
                autoComplete="new-password"
                className={`${inputCls} pl-9 pr-9`}
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Confirm</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type={showConfirm ? 'text' : 'password'}
                name="confirmPassword"
                placeholder="Repeat"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                autoComplete="new-password"
                className={`${inputCls} pl-9 pr-9`}
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {formData.confirmPassword.length > 0 && (
          <p className={`text-xs font-semibold flex items-center gap-1.5 ${
            formData.password === formData.confirmPassword ? 'text-emerald-600' : 'text-red-500'
          }`}>
            <CheckCircle className="w-3 h-3" />
            {formData.password === formData.confirmPassword ? 'Passwords match' : 'Passwords do not match'}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-xl text-sm font-black tracking-wide text-white transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 mt-1"
          style={{
            background: 'linear-gradient(135deg, #2E4156, #1A2D42)',
            boxShadow: '0 6px 20px rgba(34,127,132,0.35)',
          }}
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</>
            : <><span>Create Free Account</span><ArrowRight className="w-4 h-4" /></>
          }
        </button>
      </form>

      <p className="text-center text-sm text-slate-400">
        Already have an account?{' '}
        <Link href="/login" className="font-bold text-[#2E4156] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

