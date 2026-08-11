'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { FileText, Download, Send, Loader2 } from 'lucide-react'
import { effectiveDiscountPct } from '@/lib/billing/pricing'

type Cycle = '3_MONTH' | '6_MONTH' | 'ANNUAL'

const BASIC_PRICE = 50
const PRO_PRICE = 100
const CYCLE_MONTHS: Record<Cycle, number> = { '3_MONTH': 3, '6_MONTH': 6, ANNUAL: 12 }
const CYCLE_LABEL: Record<Cycle, string> = { '3_MONTH': '3 Months', '6_MONTH': '6 Months', ANNUAL: '1 Year' }

function num(n: number) { return n.toLocaleString('en-PH') }

function makeQuoteNo() {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  const rand = String(Math.floor(d.getSeconds() * 17 + d.getMinutes() * 7 + 1)).padStart(3, '0').slice(-3)
  return `QT-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${rand}`
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0055d4]/30 focus:border-[#0055d4]'
const labelCls = 'text-xs font-semibold text-slate-500 uppercase tracking-wide'

export default function ProposalGeneratorPage() {
  const [quoteNo, setQuoteNo] = useState(makeQuoteNo())
  const [date] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [validityDays, setValidityDays] = useState(30)
  const [subtitle, setSubtitle] = useState('FOR HRIS SYSTEM')

  const [clientCompany, setClientCompany] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')

  const [seats, setSeats] = useState(25)
  const [cycle, setCycle] = useState<Cycle>('ANNUAL')

  const [scope, setScope] = useState('')
  const [pricingNote, setPricingNote] = useState('You can choose a subscription duration from 3 months up to 1 year. A 20% discount is applied to annual subscriptions.')
  const [preparedBy, setPreparedBy] = useState('NexDev Systems')

  const [emailMessage, setEmailMessage] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [sending, setSending] = useState(false)

  const pricing = useMemo(() => {
    const months = CYCLE_MONTHS[cycle]
    const disc = effectiveDiscountPct(cycle, seats)
    const basicRate = Math.round(BASIC_PRICE * (1 - disc / 100))
    const proRate = Math.round(PRO_PRICE * (1 - disc / 100))
    return { months, disc, basicRate, proRate, basicMonthly: basicRate * seats, proMonthly: proRate * seats }
  }, [cycle, seats])

  function payload() {
    return {
      quoteNo, date, validityDays: Number(validityDays) || 30, subtitle,
      clientCompany, clientContact, clientEmail, clientAddress,
      seats: Number(seats) || 0, billingCycle: cycle,
      scope, notes: pricingNote, preparedBy,
    }
  }

  function validate() {
    if (!clientCompany.trim()) { toast.error('Enter the client company name'); return false }
    return true
  }

  function autofillSummary() {
    const company = clientCompany.trim() || 'Your organization'
    setScope(
      `${company} requires a reliable, fully Philippine-compliant HR and payroll platform that streamlines time & attendance, automates payroll, and empowers employees through self-service. ` +
      `OnClock by NexDev Systems delivers an end-to-end solution — biometric/GPS time tracking, automated DTR, statutory-compliant payroll (SSS, PhilHealth, Pag-IBIG, BIR), and a complete employee portal — in one integrated system. ` +
      `This proposal presents a side-by-side plan comparison and pricing for ${seats} employee${seats === 1 ? '' : 's'} on a ${CYCLE_LABEL[cycle]} term, designed to reduce manual effort, eliminate computation errors, and keep ${company} compliant with DOLE and BIR requirements.`,
    )
  }

  async function downloadPdf() {
    if (!validate()) return
    setDownloading(true)
    try {
      const res = await fetch('/api/admin/proposal/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()),
      })
      if (!res.ok) { toast.error('Failed to generate PDF'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${quoteNo}.pdf`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Quotation PDF downloaded')
    } finally { setDownloading(false) }
  }

  async function sendEmail() {
    if (!validate()) return
    const to = clientEmail.trim()
    if (!to) { toast.error('Enter the client email to send to'); return }
    setSending(true)
    try {
      const res = await fetch('/api/admin/proposal/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal: payload(), to, message: emailMessage.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to send email'); return }
      toast.success(`Proposal emailed to ${to}`)
    } finally { setSending(false) }
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#021e47' }}>
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proposal & Quotation Generator</h1>
          <p className="text-sm text-slate-500">Generates a 3-page proposal (cover · executive summary &amp; features · quotation) — export to PDF or email it.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Form ── */}
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800">Quotation details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Quotation No.</label>
                <input className={inputCls + ' mt-1'} value={quoteNo} onChange={e => setQuoteNo(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Issued</label>
                <input className={inputCls + ' mt-1 bg-slate-50'} value={date} readOnly />
              </div>
              <div>
                <label className={labelCls}>Valid for (days)</label>
                <input type="number" min={1} className={inputCls + ' mt-1'} value={validityDays} onChange={e => setValidityDays(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Cover subtitle</label>
              <input className={inputCls + ' mt-1'} value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="FOR HRIS SYSTEM" />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800">Prepared to</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Contact person</label>
                <input className={inputCls + ' mt-1'} value={clientContact} onChange={e => setClientContact(e.target.value)} placeholder="Rain Yung" />
              </div>
              <div>
                <label className={labelCls}>Company name *</label>
                <input className={inputCls + ' mt-1'} value={clientCompany} onChange={e => setClientCompany(e.target.value)} placeholder="VVVVV Holdings" />
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input className={inputCls + ' mt-1'} value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Makati City" />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input className={inputCls + ' mt-1'} value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="rain.yung@outlook.com" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800">Quantity & term (drives pricing)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Employees (qty)</label>
                <input type="number" min={1} className={inputCls + ' mt-1'} value={seats} onChange={e => setSeats(Number(e.target.value))} />
              </div>
              <div>
                <label className={labelCls}>Subscription term</label>
                <select className={inputCls + ' mt-1'} value={cycle} onChange={e => setCycle(e.target.value as Cycle)}>
                  <option value="3_MONTH">3 Months</option>
                  <option value="6_MONTH">6 Months</option>
                  <option value="ANNUAL">1 Year (20% off)</option>
                </select>
              </div>
            </div>
            {pricing.disc > 0 && (
              <p className="text-xs font-medium text-emerald-700">{pricing.disc}% discount applied{seats > 100 ? ' (100+ seat volume pricing)' : ''}.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800">Executive summary</h2>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls}>Summary text</label>
                <button type="button" onClick={autofillSummary} className="text-xs font-semibold text-[#0055d4] hover:underline">Auto-fill</button>
              </div>
              <textarea className={inputCls + ' h-32'} value={scope} onChange={e => setScope(e.target.value)}
                placeholder="Click Auto-fill to generate, or write a high-level overview of the client's needs and how OnClock addresses them." />
            </div>
            <p className="text-[11px] text-slate-400">The Basic vs Pro feature comparison is included automatically on page 2.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800">Quotation footer</h2>
            <div>
              <label className={labelCls}>Pricing note</label>
              <textarea className={inputCls + ' mt-1 h-20'} value={pricingNote} onChange={e => setPricingNote(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Prepared by</label>
              <input className={inputCls + ' mt-1'} value={preparedBy} onChange={e => setPreparedBy(e.target.value)} />
            </div>
          </section>
        </div>

        {/* ── Summary + actions ── */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sticky top-6">
            <h2 className="text-sm font-bold text-slate-800 mb-3">Pricing breakdown</h2>
            <p className="text-[11px] text-slate-400 mb-3">{seats} employees · {CYCLE_LABEL[cycle]}</p>
            <div className="rounded-lg border border-slate-200 overflow-hidden text-sm">
              <div className="grid grid-cols-3 bg-primary text-white text-[11px] font-semibold px-3 py-2">
                <span>Plan</span><span className="text-right">Price</span><span className="text-right">/ month</span>
              </div>
              <div className="grid grid-cols-3 px-3 py-2 border-b border-slate-100">
                <span className="font-medium text-slate-700">Basic</span>
                <span className="text-right text-slate-600">{num(pricing.basicRate)}</span>
                <span className="text-right font-bold text-primary">{num(pricing.basicMonthly)}</span>
              </div>
              <div className="grid grid-cols-3 px-3 py-2">
                <span className="font-medium text-slate-700">Pro</span>
                <span className="text-right text-slate-600">{num(pricing.proRate)}</span>
                <span className="text-right font-bold text-primary">{num(pricing.proMonthly)}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Prices in PHP per seat / month{pricing.disc > 0 ? ` (incl. ${pricing.disc}% discount)` : ''}.</p>

            <button onClick={downloadPdf} disabled={downloading}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download PDF
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-slate-800">Send via email</h2>
            <div>
              <label className={labelCls}>Recipient</label>
              <input className={inputCls + ' mt-1'} value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com" />
            </div>
            <div>
              <label className={labelCls}>Message (optional)</label>
              <textarea className={inputCls + ' mt-1 h-24'} value={emailMessage} onChange={e => setEmailMessage(e.target.value)}
                placeholder="Leave blank to use the default cover message." />
            </div>
            <button onClick={sendEmail} disabled={sending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#0055d4' }}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Proposal
            </button>
            <p className="text-[11px] text-slate-400">The PDF is attached automatically.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
