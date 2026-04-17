'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import Image from 'next/image'
import { Printer, ArrowLeft, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface InvoiceDetail {
  id: string
  invoiceNo: string
  status: 'DRAFT' | 'UNPAID' | 'PAID' | 'VOID'
  periodStart: string
  periodEnd: string
  seatCount: number
  pricePerSeat: number
  subtotal: number
  discountPct: number
  discountAmount: number
  total: number
  paymentMethodCode: string | null
  paymentMethodLabel: string | null
  notes: string | null
  dueDate: string
  paidAt: string | null
  createdAt: string
  company: {
    name: string
    email: string
    address: string | null
    city: string | null
    province: string | null
    phone: string | null
    tin: string | null
  }
}

interface PaymentMethod {
  id: string
  code: string
  label: string
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  instructions: string | null
  qrImageUrl: string | null
}

interface InvoiceNotesPayload {
  proofOfPaymentDataUrl?: string
  proofUploadedAt?: string
}

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/billing/invoices/${id}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setInvoice(data.invoice)
        setPaymentMethods(data.paymentMethods ?? [])
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-[#2E4156]" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="text-center py-24 text-slate-400">
        <AlertCircle className="w-8 h-8 mx-auto mb-3" />
        <p className="font-medium">Invoice not found.</p>
        <Link href="/settings/billing" className="text-[#2E4156] text-sm mt-2 inline-block hover:underline">
          ← Back to Billing
        </Link>
      </div>
    )
  }

  const lineItems = [
    {
      description: `${invoice.seatCount} Active Employee${invoice.seatCount !== 1 ? 's' : ''} × ${fmt(invoice.pricePerSeat)}/mo`,
      amount: invoice.subtotal,
    },
  ]

  const isAnnual = invoice.discountPct > 0
  if (isAnnual) {
    lineItems[0].description = `${invoice.seatCount} Active Employee${invoice.seatCount !== 1 ? 's' : ''} × ${fmt(invoice.pricePerSeat)}/mo × 12 months`
  }

  const statusConfig = {
    PAID:   { label: 'PAID',   icon: CheckCircle, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    UNPAID: { label: 'UNPAID', icon: Clock,        color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    DRAFT:  { label: 'DRAFT',  icon: Clock,        color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
    VOID:   { label: 'VOID',   icon: AlertCircle,  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  }
  const sc = statusConfig[invoice.status]
  const StatusIcon = sc.icon
  const selectedMethod = paymentMethods.find((method) => method.code === invoice.paymentMethodCode) ?? null
  let parsedNotes: InvoiceNotesPayload = {}
  if (invoice.notes) {
    try {
      parsedNotes = JSON.parse(invoice.notes) as InvoiceNotesPayload
    } catch {
      parsedNotes = {}
    }
  }

  return (
    <>
      {/* Print/action bar — hidden in print */}
      <div className="no-print flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-10">
        <Link href="/settings/billing" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#2E4156] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Billing
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-sm shadow-md hover:shadow-lg transition-all"
          style={{ background: 'linear-gradient(135deg, #2E4156, #1A2D42)' }}
        >
          <Printer className="w-4 h-4" /> Download / Print PDF
        </button>
      </div>

      {/* Invoice document */}
      <div className="invoice-document max-w-3xl mx-auto my-8 px-4 no-print-margin">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
          {/* Header band */}
          <div className="px-10 pt-10 pb-8" style={{ background: 'linear-gradient(135deg, #1A2D42, #2E4156)' }}>
            <div className="flex items-start justify-between">
              <div>
                <Image src="/onclock-logo.png" alt="Onclock" width={140} height={46} className="object-contain brightness-0 invert mb-4" />
                <p className="text-[#C0C8CA] text-xs font-semibold">Philippine HR & Payroll Platform</p>
                <p className="text-[#C0C8CA] text-xs mt-1">hello@onclock.ph · onclock.ph</p>
              </div>
              <div className="text-right">
                <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Invoice</p>
                <p className="text-white font-black text-2xl">{invoice.invoiceNo}</p>
                <p className="text-[#C0C8CA] text-xs mt-2">
                  Issued: {format(new Date(invoice.createdAt), 'MMMM dd, yyyy')}
                </p>
                {/* Status stamp */}
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-black text-xs"
                  style={{ background: sc.bg, borderColor: sc.border, color: sc.color }}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {sc.label}
                  {invoice.paidAt && ` · ${format(new Date(invoice.paidAt), 'MMM dd, yyyy')}`}
                </div>
              </div>
            </div>
          </div>

          {/* Bill To + Details */}
          <div className="px-10 py-8 grid grid-cols-2 gap-8 border-b border-slate-100">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Bill To</p>
              <p className="font-black text-slate-900 text-base">{invoice.company.name}</p>
              {invoice.company.address && <p className="text-sm text-slate-500 mt-1">{invoice.company.address}</p>}
              {(invoice.company.city || invoice.company.province) && (
                <p className="text-sm text-slate-500">{[invoice.company.city, invoice.company.province].filter(Boolean).join(', ')}</p>
              )}
              {invoice.company.email && <p className="text-sm text-slate-500 mt-1">{invoice.company.email}</p>}
              {invoice.company.phone && <p className="text-sm text-slate-500">{invoice.company.phone}</p>}
              {invoice.company.tin && <p className="text-xs text-slate-400 mt-2">TIN: {invoice.company.tin}</p>}
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Billing Period</p>
                <p className="text-sm font-semibold text-slate-700">
                  {format(new Date(invoice.periodStart), 'MMM dd, yyyy')} – {format(new Date(invoice.periodEnd), 'MMM dd, yyyy')}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Due Date</p>
                <p className="text-sm font-semibold text-slate-700">
                  {format(new Date(invoice.dueDate), 'MMMM dd, yyyy')}
                </p>
              </div>
              {invoice.status === 'PAID' && invoice.paidAt && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Paid On</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    {format(new Date(invoice.paidAt), 'MMMM dd, yyyy')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="px-10 py-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left pb-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Description</th>
                  <th className="text-right pb-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-slate-800">{item.description}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Onclock HR & Payroll Platform — {isAnnual ? 'Annual' : 'Monthly'} subscription
                      </p>
                    </td>
                    <td className="py-4 text-right font-bold text-slate-800 whitespace-nowrap">
                      {fmt(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="mt-6 ml-auto max-w-xs space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold">{fmt(invoice.subtotal)}</span>
              </div>
              {invoice.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Annual discount ({invoice.discountPct}% off)</span>
                  <span className="font-semibold">–{fmt(invoice.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-slate-400">
                <span>VAT (0% — exempt)</span>
                <span>₱0.00</span>
              </div>
              <div className="flex justify-between pt-3 border-t-2 border-slate-200">
                <span className="font-black text-slate-900 text-base">Total Due</span>
                <span className="font-black text-xl" style={{ color: '#2E4156' }}>{fmt(invoice.total)}</span>
              </div>
            </div>
          </div>

          {/* Payment instructions */}
          <div className="px-10 py-6 border-t border-slate-100" style={{ background: '#f8fafb' }}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Payment Instructions</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-500">
              <div>
                <p className="font-bold text-slate-700 mb-1">Selected Method</p>
                <p>{invoice.paymentMethodLabel ?? selectedMethod?.label ?? 'Manual Payment'}</p>
              </div>
              <div>
                <p className="font-bold text-slate-700 mb-1">Reference</p>
                <p>Invoice No: {invoice.invoiceNo}</p>
                <p>Company: {invoice.company.name}</p>
              </div>
              <div>
                <p className="font-bold text-slate-700 mb-1">QR Payment</p>
                {selectedMethod?.qrImageUrl ? (
                  <img src={selectedMethod.qrImageUrl} alt={`${selectedMethod.label} QR`} className="w-24 h-24 rounded border border-slate-200 bg-white" />
                ) : (
                  <p>No QR configured</p>
                )}
              </div>
            </div>
            {parsedNotes.proofOfPaymentDataUrl && (
              <div className="mt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Proof of Payment</p>
                <img
                  src={parsedNotes.proofOfPaymentDataUrl}
                  alt="Uploaded proof of payment"
                  className="w-28 h-28 rounded border border-slate-200 bg-white object-cover"
                />
                {parsedNotes.proofUploadedAt && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Uploaded: {format(new Date(parsedNotes.proofUploadedAt), 'MMM dd, yyyy hh:mm a')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-10 py-5 border-t border-slate-200 flex items-center justify-between">
            <p className="text-[11px] text-slate-400">
              This is a computer-generated invoice. No signature required.
            </p>
            <p className="text-[11px] text-slate-400">
              Onclock HR & Payroll · Made in the Philippines 🇵🇭
            </p>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .invoice-document {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          .invoice-document > div {
            box-shadow: none !important;
            border-radius: 0 !important;
            border: none !important;
          }
        }
        @page {
          size: A4;
          margin: 0.25in;
        }
      `}</style>
    </>
  )
}
