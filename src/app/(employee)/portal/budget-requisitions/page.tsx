'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, FileText, ChevronDown, ChevronUp, X, Loader2, ClipboardList,
  Paperclip, Download, Trash2, Upload,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ReqAttachment {
  id: string
  fileName: string
  fileUrl: string
  fileSize: number
  mimeType: string
  createdAt: string
}

interface ReqItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unitCost: number
  totalCost: number
}

interface Requisition {
  id: string
  title: string
  purpose: string
  totalAmount: number
  currency: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  neededBy: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  items: ReqItem[]
  attachments: ReqAttachment[]
}

interface FormItem {
  description: string
  quantity: string
  unit: string
  unitCost: string
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    PENDING:   'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED:  'bg-green-50 text-green-700 border-green-200',
    REJECTED:  'bg-red-50 text-red-700 border-red-200',
    CANCELLED: 'bg-gray-50 text-gray-500 border-gray-200',
  }
  return <Badge className={cn('border', styles[status] ?? '')}>{status}</Badge>
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPeso(n: number | string) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtBytes(b: number) {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}

const EMPTY_ITEM: FormItem = { description: '', quantity: '1', unit: '', unitCost: '0' }
const TABS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const

export default function BudgetRequisitionsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [reqs, setReqs]           = useState<Requisition[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<typeof TABS[number]>('ALL')
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [showForm, setShowForm]   = useState(false)

  // Form state
  const [title, setTitle]       = useState('')
  const [purpose, setPurpose]   = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [items, setItems]       = useState<FormItem[]>([{ ...EMPTY_ITEM }])
  const [formFiles, setFormFiles] = useState<File[]>([])
  const [formErr, setFormErr]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  // Attachment management per-requisition (for deletion)
  const [deletingAttach, setDeletingAttach] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch('/api/budget-requisitions?limit=50')
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}))
        if (data.notEntitled) { router.replace('/portal/clock'); return }
      }
      const data = await res.json()
      setReqs(data.requisitions ?? [])
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = tab === 'ALL' ? reqs : reqs.filter(r => r.status === tab)

  function addItem() { setItems(prev => [...prev, { ...EMPTY_ITEM }]) }
  function removeItem(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof FormItem, value: string) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  const grandTotal = items.reduce((sum, it) => {
    return sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.unitCost) || 0)
  }, 0)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    const combined = [...formFiles, ...selected].slice(0, 10) // max 10
    setFormFiles(combined)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFormFile(index: number) {
    setFormFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    setFormErr('')
    if (!title.trim()) { setFormErr('Please enter a title.'); return }
    if (!purpose.trim()) { setFormErr('Please enter the purpose.'); return }
    if (!items.length) { setFormErr('Add at least one line item.'); return }
    for (const it of items) {
      if (!it.description.trim()) { setFormErr('Each item needs a description.'); return }
      if (parseFloat(it.quantity) <= 0) { setFormErr('Quantity must be greater than 0.'); return }
    }

    setSubmitting(true)
    setUploadProgress('')
    try {
      // Step 1: create the requisition
      const res = await fetch('/api/budget-requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          purpose,
          neededBy: neededBy || undefined,
          items: items.map(it => ({
            description: it.description,
            quantity:    parseFloat(it.quantity) || 1,
            unit:        it.unit || undefined,
            unitCost:    parseFloat(it.unitCost) || 0,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormErr(data.error ?? 'Submission failed.'); return }

      const reqId = data.requisition.id

      // Step 2: upload attachments
      if (formFiles.length > 0) {
        for (let i = 0; i < formFiles.length; i++) {
          setUploadProgress(`Uploading attachment ${i + 1} of ${formFiles.length}…`)
          const fd = new FormData()
          fd.append('file', formFiles[i])
          await fetch(`/api/budget-requisitions/${reqId}/attachments`, {
            method: 'POST',
            body: fd,
          }).catch(() => {/* ignore single file failures */})
        }
      }

      setShowForm(false)
      setTitle(''); setPurpose(''); setNeededBy('')
      setItems([{ ...EMPTY_ITEM }]); setFormFiles([])
      setUploadProgress('')
      load()
    } catch (e: unknown) {
      setFormErr((e as Error)?.message ?? 'Connection error.')
    } finally {
      setSubmitting(false)
      setUploadProgress('')
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('Cancel this requisition?')) return
    try {
      await fetch(`/api/budget-requisitions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      load()
    } catch { /* ignore */ }
  }

  async function handleDeleteAttachment(reqId: string, attachId: string) {
    setDeletingAttach(attachId)
    try {
      await fetch(`/api/budget-requisitions/${reqId}/attachments?attachmentId=${attachId}`, {
        method: 'DELETE',
      })
      setReqs(prev => prev.map(r => r.id === reqId
        ? { ...r, attachments: r.attachments.filter(a => a.id !== attachId) }
        : r
      ))
    } catch { /* ignore */ } finally {
      setDeletingAttach(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Budget Requisitions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Submit and track your purchase requests</p>
        </div>
        <Button
          onClick={() => { setShowForm(true); setFormErr(''); setFormFiles([]) }}
          className="gap-1.5"
          style={{ background: '#fa5e01', color: '#fff' }}
        >
          <Plus className="w-4 h-4" />
          New Request
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <ClipboardList className="w-10 h-10 opacity-30" />
          <p className="text-sm text-center">No requisitions found.<br />Click &ldquo;New Request&rdquo; to file one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <div
              key={req.id}
              className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
            >
              <div
                className="flex items-start gap-3 p-4 cursor-pointer"
                onClick={() => setExpanded(expanded === req.id ? null : req.id)}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#fff3eb' }}
                >
                  <FileText className="w-4 h-4" style={{ color: '#fa5e01' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900 text-sm leading-snug">{req.title}</p>
                    {statusBadge(req.status)}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Filed {fmtDate(req.createdAt)}
                    {req.neededBy && <span> · Needed by {fmtDate(req.neededBy)}</span>}
                  </p>
                  <p className="text-base font-bold mt-1" style={{ color: '#1a2d42' }}>
                    {fmtPeso(req.totalAmount)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-400">{req.items.length} item{req.items.length !== 1 ? 's' : ''}</p>
                    {req.attachments.length > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-gray-400">
                        <Paperclip className="w-3 h-3" />
                        {req.attachments.length}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-gray-400">
                  {expanded === req.id
                    ? <ChevronUp className="w-4 h-4" />
                    : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {/* Expanded detail */}
              {expanded === req.id && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                  <p className="text-xs text-gray-600 italic leading-relaxed">{req.purpose}</p>

                  {/* Items table */}
                  <div className="rounded-lg overflow-hidden border border-gray-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 uppercase text-[10px] font-semibold tracking-wide">
                          <th className="text-left px-3 py-2">Description</th>
                          <th className="text-right px-3 py-2">Qty</th>
                          <th className="text-right px-3 py-2">Unit Cost</th>
                          <th className="text-right px-3 py-2">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {req.items.map(it => (
                          <tr key={it.id}>
                            <td className="px-3 py-2 text-gray-800">
                              {it.description}
                              {it.unit && <span className="text-gray-400"> ({it.unit})</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">{it.quantity}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{fmtPeso(it.unitCost)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmtPeso(it.totalCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-200 bg-gray-50">
                          <td colSpan={3} className="px-3 py-2 text-right text-xs font-bold text-gray-600 uppercase tracking-wide">Total</td>
                          <td className="px-3 py-2 text-right text-sm font-bold" style={{ color: '#1a2d42' }}>{fmtPeso(req.totalAmount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Attachments */}
                  {req.attachments.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Paperclip className="w-3 h-3" /> Attachments
                      </p>
                      <div className="space-y-1.5">
                        {req.attachments.map(att => (
                          <div
                            key={att.id}
                            className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{att.fileName}</p>
                              <p className="text-[10px] text-gray-400">{fmtBytes(att.fileSize)}</p>
                            </div>
                            <a
                              href={att.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={att.fileName}
                              className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500"
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            {req.status === 'PENDING' && (
                              <button
                                onClick={() => handleDeleteAttachment(req.id, att.id)}
                                disabled={deletingAttach === att.id}
                                className="p-1 rounded hover:bg-red-50 transition-colors text-red-400 disabled:opacity-50"
                                title="Remove attachment"
                              >
                                {deletingAttach === att.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review note */}
                  {req.reviewNote && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Review Note</p>
                      <p className="text-xs text-gray-700">{req.reviewNote}</p>
                    </div>
                  )}

                  {/* Cancel action */}
                  {req.status === 'PENDING' && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                    >
                      Cancel Request
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Request Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div
            className="bg-white rounded-t-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
            style={{ padding: '24px 20px 40px' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">New Budget Requisition</h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {formErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-lg mb-4">
                {formErr}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Request Title</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition"
                  placeholder="e.g. Office Supplies — Q2 2026"
                  value={title} onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Purpose / Justification</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition resize-none"
                  rows={3}
                  placeholder="Explain why this purchase is needed..."
                  value={purpose} onChange={e => setPurpose(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Date Needed By <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition"
                  value={neededBy} onChange={e => setNeededBy(e.target.value)}
                />
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500">Line Items</label>
                  <button onClick={addItem} className="text-xs font-bold text-orange-500 hover:text-orange-700 transition-colors">+ Add Item</button>
                </div>

                <div className="grid grid-cols-[1fr_60px_64px_88px_28px] gap-1.5 mb-1 px-0.5">
                  {['Description','Qty','Unit','Unit Cost',''].map((h, i) => (
                    <span key={i} className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{h}</span>
                  ))}
                </div>

                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_60px_64px_88px_28px] gap-1.5 mb-1.5 items-center">
                    <input
                      className="border border-gray-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                      placeholder="Description"
                      value={it.description}
                      onChange={e => updateItem(i, 'description', e.target.value)}
                    />
                    <input
                      type="number" min="0.01" step="0.01"
                      className="border border-gray-200 rounded-lg px-2 py-2 text-xs outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-right"
                      value={it.quantity}
                      onChange={e => updateItem(i, 'quantity', e.target.value)}
                    />
                    <input
                      className="border border-gray-200 rounded-lg px-2 py-2 text-xs outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
                      placeholder="pcs"
                      value={it.unit}
                      onChange={e => updateItem(i, 'unit', e.target.value)}
                    />
                    <input
                      type="number" min="0" step="0.01"
                      className="border border-gray-200 rounded-lg px-2 py-2 text-xs outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-right"
                      value={it.unitCost}
                      onChange={e => updateItem(i, 'unitCost', e.target.value)}
                    />
                    <button
                      onClick={() => removeItem(i)}
                      disabled={items.length === 1}
                      className="w-7 h-7 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                <div className="text-right text-sm font-bold mt-2 pt-2 border-t border-gray-100" style={{ color: '#1a2d42' }}>
                  Total: {fmtPeso(grandTotal)}
                </div>
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Attachments <span className="font-normal text-gray-400">(optional · PDF, image, Word, Excel · max 20 MB each)</span>
                </label>

                {/* Upload trigger */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 flex flex-col items-center gap-2 text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-colors"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-xs font-medium">Click to attach files</span>
                  <span className="text-[10px]">Up to 10 files</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {/* Selected files list */}
                {formFiles.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {formFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{f.name}</p>
                          <p className="text-[10px] text-gray-400">{fmtBytes(f.size)}</p>
                        </div>
                        <button
                          onClick={() => removeFormFile(i)}
                          className="p-1 rounded hover:bg-red-50 text-red-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {uploadProgress && (
              <p className="text-xs text-orange-500 font-medium mt-3 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {uploadProgress}
              </p>
            )}

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2"
                style={{ background: '#fa5e01', color: '#fff' }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
