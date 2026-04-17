'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import {
  FileText, Download, Building2, Mail, User,
  CheckCircle, Loader2, Info, Zap, Tag,
} from 'lucide-react'
import { toast } from 'sonner'

const MONTHLY_PRICE = 50
const ANNUAL_PRICE_PER_MONTH = 40

function fmt(n: number) {
  return '₱ ' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function genQuotationNo() {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = String(now.getMonth() + 1).padStart(2, '0')
  const d   = String(now.getDate()).padStart(2, '0')
  const rnd = Math.floor(Math.random() * 9000) + 1000
  return `QT-${y}${m}${d}-${rnd}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

interface FormState {
  plan: 'MONTHLY' | 'ANNUAL'
  seats: number
  clientName: string
  clientCompany: string
  clientEmail: string
  validDays: number
  quotationNo: string
  issuedDate: string
  includeSetup: boolean
  setupFee: number
  notes: string
}

const INITIAL: FormState = {
  plan:          'MONTHLY',
  seats:         10,
  clientName:    '',
  clientCompany: '',
  clientEmail:   '',
  validDays:     30,
  quotationNo:   '',
  issuedDate:    '',
  includeSetup:  false,
  setupFee:      5000,
  notes:         'This quotation is valid for the number of days stated. Prices are in Philippine Peso and are exclusive of VAT unless stated otherwise.',
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  )
}

function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#2E4156]/30 focus:border-[#2E4156] transition-all bg-white placeholder:text-slate-300 ${className}`}
      {...props}
    />
  )
}

function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#2E4156]/30 focus:border-[#2E4156] transition-all bg-white placeholder:text-slate-300 resize-none ${className}`}
      {...props}
    />
  )
}

function SummaryRow({ label, value, bold, green, muted }: { label: string; value: string; bold?: boolean; green?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
      <span className={`text-sm ${muted ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-black text-slate-900' : ''} ${green ? 'text-emerald-600 font-bold' : ''} ${muted ? 'text-slate-400 line-through' : ''}`}>{value}</span>
    </div>
  )
}

export default function QuotationPage() {
  const [form, setForm]       = useState<FormState>(INITIAL)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setForm(prev => {
      if (prev.quotationNo && prev.issuedDate) return prev
      return { ...prev, quotationNo: genQuotationNo(), issuedDate: today() }
    })
  }, [])

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  const pricePerSeat  = form.plan === 'ANNUAL' ? ANNUAL_PRICE_PER_MONTH : MONTHLY_PRICE
  const periods       = form.plan === 'ANNUAL' ? 12 : 1
  const seats         = Math.max(1, form.seats || 1)
  const subtotal      = pricePerSeat * seats * periods
  const setupFee      = form.includeSetup ? (form.setupFee || 0) : 0
  const total         = subtotal + setupFee
  const savings       = form.plan === 'ANNUAL' ? MONTHLY_PRICE * 12 * seats - subtotal : 0
  const monthlyEquiv  = total / (form.plan === 'ANNUAL' ? 12 : 1)

  const validUntil = new Date(form.issuedDate)
  validUntil.setDate(validUntil.getDate() + form.validDays)
  const validUntilLabel = form.issuedDate
    ? validUntil.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '--'

  async function generate() {
    if (!form.clientCompany.trim()) {
      toast.error('Please enter the client company name.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/quotation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, seats }),
      })
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `Onclock-Quotation-${form.quotationNo}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Quotation PDF downloaded!')
    } catch {
      toast.error('Failed to generate PDF. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

      {/* Standalone header with logo */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <Image src="/onclock-logo.png" alt="Onclock" width={120} height={36} className="object-contain h-8 w-auto" />
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <h1 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2E4156]" />
              Quotation Generator
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Create and download a professional pricing quotation for a client.</p>
          </div>
        </div>
        <button
          onClick={() => setForm({ ...INITIAL, quotationNo: genQuotationNo(), issuedDate: today() })}
          className="text-xs font-semibold text-slate-500 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── LEFT: FORM ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Quotation Meta */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <p className="text-sm font-black text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2E4156]" /> Quotation Details
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Quotation No.">
                <Input value={form.quotationNo} onChange={e => set('quotationNo', e.target.value)} />
              </Field>
              <Field label="Issue Date">
                <Input type="date" value={form.issuedDate} onChange={e => set('issuedDate', e.target.value)} />
              </Field>
              <Field label="Valid For (days)" hint={`Valid until ${validUntilLabel}`}>
                <div className="relative">
                  <Input
                    type="number" min={1} max={365}
                    value={form.validDays}
                    onChange={e => set('validDays', Number(e.target.value))}
                  />
                </div>
              </Field>
            </div>
          </div>

          {/* Client Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <p className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#2E4156]" /> Client Information
            </p>
            <div className="grid grid-cols-1 gap-4">
              <Field label="Company Name *">
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    className="pl-8"
                    placeholder="Acme Corporation"
                    value={form.clientCompany}
                    onChange={e => set('clientCompany', e.target.value)}
                  />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contact Person">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input
                      className="pl-8"
                      placeholder="Juan dela Cruz"
                      value={form.clientName}
                      onChange={e => set('clientName', e.target.value)}
                    />
                  </div>
                </Field>
                <Field label="Email Address">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input
                      className="pl-8"
                      type="email"
                      placeholder="juan@acme.com"
                      value={form.clientEmail}
                      onChange={e => set('clientEmail', e.target.value)}
                    />
                  </div>
                </Field>
              </div>
            </div>
          </div>

          {/* Plan + Seats */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <p className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#2E4156]" /> Plan Selection
            </p>

            {/* Plan cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* Monthly */}
              <button
                type="button"
                onClick={() => set('plan', 'MONTHLY')}
                className={`rounded-xl border-2 p-4 text-left transition-all ${form.plan === 'MONTHLY' ? 'border-[#2E4156] bg-[#D4D8DD]/50' : 'border-slate-200 hover:border-[#AAB7B7]'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-slate-900">Monthly</span>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.plan === 'MONTHLY' ? 'border-[#2E4156]' : 'border-slate-300'}`}>
                    {form.plan === 'MONTHLY' && <div className="w-2 h-2 rounded-full bg-[#2E4156]" />}
                  </div>
                </div>
                <p className="text-xl font-black text-[#1A2D42]">₱50</p>
                <p className="text-xs text-slate-500">per seat / month</p>
                <p className="text-xs text-slate-400 mt-1">Billed monthly</p>
              </button>
              {/* Annual */}
              <button
                type="button"
                onClick={() => set('plan', 'ANNUAL')}
                className={`rounded-xl border-2 p-4 text-left transition-all relative overflow-hidden ${form.plan === 'ANNUAL' ? 'border-[#2E4156] bg-[#D4D8DD]/50' : 'border-slate-200 hover:border-[#AAB7B7]'}`}
              >
                <div className="absolute top-2 right-2 bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">SAVE 20%</div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-slate-900">Annual</span>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.plan === 'ANNUAL' ? 'border-[#2E4156]' : 'border-slate-300'}`}>
                    {form.plan === 'ANNUAL' && <div className="w-2 h-2 rounded-full bg-[#2E4156]" />}
                  </div>
                </div>
                <p className="text-xl font-black text-[#1A2D42]">₱40</p>
                <p className="text-xs text-slate-500">per seat / month</p>
                <p className="text-xs text-emerald-600 font-bold mt-1">₱480/seat/year</p>
              </button>
            </div>

            {/* Seat count */}
            <Field label="Number of Employees (Seats)" hint="Each employee requires one seat">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => set('seats', Math.max(1, seats - 1))}
                  className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 font-bold text-lg"
                >−</button>
                <Input
                  type="number" min={1}
                  value={form.seats}
                  onChange={e => set('seats', Number(e.target.value))}
                  className="text-center font-black text-lg"
                />
                <button
                  type="button"
                  onClick={() => set('seats', seats + 1)}
                  className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 font-bold text-lg"
                >+</button>
              </div>
            </Field>
          </div>

          {/* Setup Fee */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#2E4156]" /> Optional Add-ons
              </p>
            </div>
            <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${form.includeSetup ? 'border-[#2E4156] bg-[#D4D8DD]/40' : 'border-slate-200 hover:border-[#AAB7B7]'}`}>
              <input
                type="checkbox"
                checked={form.includeSetup}
                onChange={e => set('includeSetup', e.target.checked)}
                className="mt-0.5 accent-[#2E4156] w-4 h-4"
              />
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-800">One-time Setup & Onboarding Fee</p>
                <p className="text-xs text-slate-500 mt-0.5">Account configuration, data import assistance, and 1-hour orientation session</p>
                {form.includeSetup && (
                  <div className="mt-3">
                    <Field label="Setup Fee Amount">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">₱</span>
                        <Input
                          className="pl-7"
                          type="number" min={0}
                          value={form.setupFee}
                          onChange={e => set('setupFee', Number(e.target.value))}
                        />
                      </div>
                    </Field>
                  </div>
                )}
              </div>
            </label>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <p className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Info className="w-4 h-4 text-[#2E4156]" /> Notes & Terms
            </p>
            <Field label="Additional Notes (optional)">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Enter any custom notes or terms for this quotation..."
              />
            </Field>
          </div>
        </div>

        {/* ── RIGHT: SUMMARY + DOWNLOAD ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Live Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden sticky top-6">
            {/* Summary header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-black text-slate-800">Quotation Summary</p>
              <p className="text-xs text-slate-500 mt-0.5">#{form.quotationNo}</p>
            </div>

            <div className="px-6 py-4 space-y-1">
              <SummaryRow label="Plan" value={form.plan === 'ANNUAL' ? 'Annual (12 months)' : 'Monthly'} />
              <SummaryRow label="Seats" value={`${seats} employee${seats !== 1 ? 's' : ''}`} />
              <SummaryRow label="Rate per Seat" value={`${fmt(pricePerSeat)}/mo`} />
              <SummaryRow label="Billing Period" value={form.plan === 'ANNUAL' ? '12 months' : '1 month'} />
              <SummaryRow label="Subscription" value={fmt(subtotal)} />
              {form.includeSetup && (
                <SummaryRow label="Setup Fee (one-time)" value={fmt(setupFee)} />
              )}
              {savings > 0 && (
                <SummaryRow label="Annual Discount (20%)" value={`−${fmt(savings)}`} green />
              )}
            </div>

            {/* Total */}
            <div className="mx-6 mb-2 rounded-xl p-4" style={{ background: 'linear-gradient(135deg, #1A2D42, #2E4156)' }}>
              <p className="text-xs text-white/60 font-semibold">TOTAL AMOUNT DUE</p>
              <p className="text-2xl font-black text-white mt-1">{fmt(total)}</p>
              {form.plan === 'ANNUAL' && (
                <p className="text-xs text-white/60 mt-1">≈ {fmt(monthlyEquiv)}/month</p>
              )}
              {savings > 0 && (
                <div className="mt-2 inline-flex items-center gap-1 bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  <CheckCircle className="w-2.5 h-2.5" /> You save {fmt(savings)}
                </div>
              )}
            </div>

            {/* Client preview */}
            {(form.clientCompany || form.clientName) && (
              <div className="mx-6 mb-4 bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Prepared For</p>
                <p className="text-sm font-bold text-slate-800">{form.clientCompany || '—'}</p>
                {form.clientName && <p className="text-xs text-slate-500">{form.clientName}</p>}
                {form.clientEmail && <p className="text-xs text-slate-400">{form.clientEmail}</p>}
              </div>
            )}

            {/* What's included */}
            <div className="mx-6 mb-4">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-2">Includes</p>
              <div className="space-y-1">
                {[
                  'Fingerprint & GPS Attendance',
                  'Automated Payroll Processing',
                  'BIR, SSS, PhilHealth, Pag-IBIG Reports',
                  'Employee Self-Service Mobile Portal',
                  'Leave & Loan Management',
                  'Admin Dashboard & Analytics',
                ].map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-[#2E4156] flex-shrink-0" />
                    <span className="text-xs text-slate-600">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Download button */}
            <div className="px-6 pb-6">
              <button
                onClick={generate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-60"
                style={{ background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1A2D42, #2E4156)' }}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…</>
                  : <><Download className="w-4 h-4" /> Download Quotation PDF</>
                }
              </button>
              <p className="text-center text-[10px] text-slate-400 mt-2">2-page professional PDF · instant download</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

