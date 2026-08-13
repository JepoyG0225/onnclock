'use client'

/**
 * My Loans — the employee's own loans, and a form to request a new one.
 *
 * Employees could not request a loan at all before; loans were admin-created
 * only. That works now because LoanStatus has a PENDING state: a requested loan
 * sits there until someone approves it into ACTIVE, and nothing deducts a
 * PENDING loan — payroll compute, payroll lock, final pay and the cash-advance
 * limit all filter on ACTIVE. So filing here can never reach a payslip on its
 * own.
 *
 * Uses GET/POST /api/loans, which scopes an EMPLOYEE to their own record
 * server-side: the list is filtered to them and the employeeId on create is
 * overridden with their own, so the id is never trusted from this form.
 */
import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Plus, Loader2, CreditCard, X } from 'lucide-react'

const NAVY = '#032b63'
const ORANGE = '#ff5900'

type LoanStatus = 'PENDING' | 'ACTIVE' | 'FULLY_PAID' | 'CANCELLED'

interface Loan {
  id: string
  loanType: string
  principalAmount: number | string
  balance: number | string
  monthlyAmortization: number | string
  startDate: string
  status: LoanStatus
  notes: string | null
  createdAt: string
}

const LOAN_TYPES = [
  { value: 'SSS_SALARY_LOAN',      label: 'SSS Salary Loan' },
  { value: 'SSS_CALAMITY_LOAN',    label: 'SSS Calamity Loan' },
  { value: 'PAGIBIG_MULTI_PURPOSE', label: 'Pag-IBIG Multi-Purpose' },
  { value: 'PAGIBIG_CALAMITY',     label: 'Pag-IBIG Calamity' },
  { value: 'COMPANY_LOAN',         label: 'Company Loan' },
  { value: 'OTHER',                label: 'Other' },
] as const

const TYPE_LABEL: Record<string, string> =
  Object.fromEntries(LOAN_TYPES.map(t => [t.value, t.label]))

/**
 * Repayment terms, in months. Longer than cash advance's 1-3 because SSS and
 * Pag-IBIG loans are normally amortised over years. Labelled in years past the
 * 12-month mark — "24 months" is harder to read than "2 years".
 */
const REPAYMENT_TERMS = [
  { months: 1,  label: '1 month' },
  { months: 2,  label: '2 months' },
  { months: 3,  label: '3 months' },
  { months: 6,  label: '6 months' },
  { months: 9,  label: '9 months' },
  { months: 12, label: '1 year' },
  { months: 18, label: '1 year 6 months' },
  { months: 24, label: '2 years' },
  { months: 36, label: '3 years' },
  { months: 48, label: '4 years' },
  { months: 60, label: '5 years' },
] as const

const STATUS_TONE: Record<LoanStatus, { bar: string; bg: string; fg: string; label: string }> = {
  PENDING:    { bar: '#f59e0b', bg: '#fffbeb', fg: '#b45309', label: 'Pending approval' },
  ACTIVE:     { bar: '#10b981', bg: '#ecfdf5', fg: '#047857', label: 'Active' },
  FULLY_PAID: { bar: '#94a3b8', bg: '#f8fafc', fg: '#475569', label: 'Fully paid' },
  CANCELLED:  { bar: '#ef4444', bg: '#fef2f2', fg: '#b91c1c', label: 'Cancelled' },
}

function peso(n: number | string) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function MyLoansTab() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    loanType: 'COMPANY_LOAN',
    amount: '',
    repaymentMonths: 6,
    startDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // No employeeId is sent — the server scopes an EMPLOYEE to their own.
      const res = await fetch('/api/loans?limit=100')
      if (!res.ok) throw new Error(`Could not load loans (${res.status})`)
      const data = await res.json()
      setLoans(data.loans ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load loans')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const amount = Number(form.amount)
  const months = form.repaymentMonths
  const valid = amount > 0 && months > 0 && !!form.startDate
  // Rounded to centavos because it is sent as the loan's monthlyAmortization
  // and payroll divides it per cutoff — a long decimal would drift.
  const monthly = valid ? Math.round((amount / months) * 100) / 100 : 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Required by the schema but ignored for employees — the server
          // replaces it with the caller's own record.
          employeeId: 'self',
          loanType: form.loanType,
          amount,
          monthlyAmortization: monthly,
          startDate: form.startDate,
          notes: form.notes || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(typeof body?.error === 'string' ? body.error : 'Could not submit the request')
      }
      toast.success('Loan request submitted — pending approval')
      setShowForm(false)
      setForm({
        loanType: 'COMPANY_LOAN', amount: '', repaymentMonths: 6,
        startDate: format(new Date(), 'yyyy-MM-dd'), notes: '',
      })
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit the request')
    } finally {
      setSaving(false)
    }
  }

  const activeBalance = loans
    .filter(l => l.status === 'ACTIVE')
    .reduce((s, l) => s + Number(l.balance), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-400">
            {loading
              ? 'Loading…'
              : activeBalance > 0
                ? `${peso(activeBalance)} outstanding`
                : 'No outstanding balance'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-1.5 text-white px-4 py-2.5 rounded-2xl text-[13px] font-black shrink-0 active:scale-[0.98] transition-transform"
          style={{ background: ORANGE, boxShadow: '0 8px 20px rgba(255,89,0,0.28)' }}
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" strokeWidth={2.6} />}
          {showForm ? 'Cancel' : 'Request loan'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 space-y-3">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
              Loan type
            </label>
            <select
              value={form.loanType}
              onChange={e => setForm(f => ({ ...f, loanType: e.target.value }))}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white font-medium"
            >
              {LOAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
              Amount
            </label>
            <input
              type="number" inputMode="decimal" min="1" step="0.01"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
              Repay over
            </label>
            <select
              value={form.repaymentMonths}
              onChange={e => setForm(f => ({ ...f, repaymentMonths: Number(e.target.value) }))}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white font-medium"
            >
              {REPAYMENT_TERMS.map(t => (
                <option key={t.months} value={t.months}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
              Start date
            </label>
            <input
              type="date"
              value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
              Reason <span className="text-slate-300 font-bold">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="What is this loan for?"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium resize-none"
            />
          </div>

          {valid && (
            <div className="rounded-xl px-3 py-2.5 space-y-1" style={{ background: 'rgba(3,43,99,0.06)' }}>
              <p className="text-[12px] font-semibold text-slate-600">
                About <span className="font-black" style={{ color: NAVY }}>{peso(monthly)}</span> deducted
                per month over {REPAYMENT_TERMS.find(t => t.months === months)?.label ?? `${months} months`}.
              </p>
              {/* Payroll splits the monthly amortisation across the cutoffs in a
                  month (SEMI_MONTHLY=2), so the per-cutoff figure is what
                  actually leaves a payslip. The admin loan form shows the same
                  split; this makes the portal match it. */}
              <p className="text-[11px] font-semibold text-slate-400">
                ≈ {peso(monthly / 2)} per cutoff on semi-monthly payroll
              </p>
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Your request is reviewed before anything is deducted. Nothing appears on your
            payslip until it is approved.
          </p>

          <button
            type="submit"
            disabled={!valid || saving}
            className="w-full py-3 rounded-2xl text-[14px] font-black text-white disabled:opacity-50 active:scale-[0.98] transition-transform"
            style={{ background: `linear-gradient(135deg, #021e47, ${NAVY})` }}
          >
            {saving ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</span> : 'Submit request'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2].map(i => <div key={i} className="h-24 bg-white/70 rounded-2xl animate-pulse" />)}
        </div>
      ) : loans.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-base font-black text-slate-900">No loans</p>
          <p className="text-sm text-slate-500 mt-1.5 max-w-xs mx-auto">
            Loans your company records for you appear here, along with anything you request.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {loans.map(l => {
            const tone = STATUS_TONE[l.status] ?? STATUS_TONE.CANCELLED
            const principal = Number(l.principalAmount)
            const balance = Number(l.balance)
            const paidPct = principal > 0
              ? Math.min(100, Math.max(0, ((principal - balance) / principal) * 100))
              : 0
            return (
              <div
                key={l.id}
                className="relative rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3.5 pl-5 overflow-hidden"
              >
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: tone.bar }} />

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-slate-900 truncate">
                      {TYPE_LABEL[l.loanType] ?? l.loanType}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                      {peso(principal)} · {peso(l.monthlyAmortization)}/mo · from {format(new Date(l.startDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full shrink-0"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {tone.label}
                  </span>
                </div>

                {l.status === 'ACTIVE' && (
                  <div className="mt-3">
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full" style={{ width: `${paidPct}%`, background: ORANGE }} />
                    </div>
                    <p className="text-[11px] font-semibold text-slate-400 mt-1.5">
                      {peso(balance)} remaining of {peso(principal)}
                    </p>
                  </div>
                )}

                {l.notes && (
                  <p className="text-[12px] text-slate-500 mt-2 leading-relaxed">{l.notes}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
