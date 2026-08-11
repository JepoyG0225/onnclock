'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import {
  CheckCircle,
  Lock,
  Unlock,
  Trash2,
  AlertTriangle,
  Send,
  Download,
  MoreVertical,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Props {
  runId: string
  status: string
  periodLabel: string
  canApprove?: boolean
  approveDisabledReason?: string
}

export default function PayrollActionButtons({
  runId,
  status,
  periodLabel,
  canApprove = true,
  approveDisabledReason,
}: Props) {
  const router  = useRouter()
  const [loading,       setLoading]       = useState<string | null>(null)
  const [showDeleteDlg, setShowDeleteDlg] = useState(false)
  const [showUnlockDlg, setShowUnlockDlg] = useState(false)
  const [confirmText,   setConfirmText]   = useState('')
  const [menuOpen,      setMenuOpen]      = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showDeleteDlg) {
      setConfirmText('')
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [showDeleteDlg])

  // Close the actions dropdown on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function action(type: 'submit' | 'approve' | 'lock' | 'unlock') {
    setLoading(type)
    try {
      const endpoint = type === 'submit' ? 'submit' : type === 'approve' ? 'approve' : type === 'unlock' ? 'unlock' : 'lock'
      const res = await fetch(`/api/payroll/${runId}/${endpoint}`, { method: 'POST' })
      if (res.ok) {
        const msgs: Record<string, string> = {
          submit: 'Payroll submitted for approval',
          approve: 'Payroll approved',
          lock: 'Payroll locked',
          unlock: 'Payroll unlocked',
        }
        toast.success(msgs[type])
        router.refresh()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Action failed')
      }
    } finally {
      setLoading(null)
    }
  }

  async function deleteRun() {
    if (confirmText.trim().toUpperCase() !== 'DELETE') return
    setLoading('delete')
    try {
      const res = await fetch(`/api/payroll/${runId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Payroll run deleted')
        router.push('/payroll')
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Delete failed')
        setShowDeleteDlg(false)
      }
    } finally {
      setLoading(null)
    }
  }

  const canDelete = status !== 'LOCKED'
  const confirmed = confirmText.trim().toUpperCase() === 'DELETE'
  const portalTarget = typeof document !== 'undefined' ? document.body : null

  function downloadExcel() {
    setMenuOpen(false)
    window.location.assign(`/api/payroll/${runId}/download`)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* ── Primary status-driven action ─────────────────────────────
            Stays prominent in the header so HR always sees the next
            step in the workflow at a glance. */}
        {status === 'COMPUTED' && (
          <Button
            onClick={() => action('submit')}
            disabled={!!loading}
            size="sm"
            className="bg-primary text-white hover:bg-[#032b63] focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
          >
            <Send className="w-4 h-4 mr-1.5" />
            {loading === 'submit' ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        )}
        {status === 'FOR_APPROVAL' && (
          <Button
            onClick={() => action('approve')}
            disabled={!!loading || !canApprove}
            title={!canApprove ? (approveDisabledReason ?? 'Approval not available yet') : undefined}
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700 focus-visible:ring-2 focus-visible:ring-green-500/40 transition-colors disabled:bg-green-300 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4 mr-1.5" />
            {loading === 'approve' ? 'Approving…' : 'Approve'}
          </Button>
        )}
        {status === 'APPROVED' && (
          <Button
            onClick={() => action('lock')}
            disabled={!!loading}
            size="sm"
            className="bg-purple-600 text-white hover:bg-purple-700 focus-visible:ring-2 focus-visible:ring-purple-500/40 transition-colors"
          >
            <Lock className="w-4 h-4 mr-1.5" />
            {loading === 'lock' ? 'Locking…' : 'Lock Payroll'}
          </Button>
        )}
        {status === 'LOCKED' && (
          <Button
            onClick={() => setShowUnlockDlg(true)}
            disabled={!!loading}
            size="sm"
            className="bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-2 focus-visible:ring-amber-500/40 transition-colors"
          >
            <Unlock className="w-4 h-4 mr-1.5" />
            Unlock Payroll
          </Button>
        )}

        {/* ── More actions dropdown ────────────────────────────────────
            Secondary actions (Download, Delete) used to clutter the
            header. They're now behind one icon trigger so the header
            stays focused on the workflow CTA. */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            disabled={!!loading}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1.5 w-56 rounded-lg border border-slate-200 bg-white shadow-lg z-30 overflow-hidden"
            >
              <button
                role="menuitem"
                onClick={downloadExcel}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                Download Excel
              </button>
              {canDelete && (
                <>
                  <div className="h-px bg-slate-100" />
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setShowDeleteDlg(true)
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete payroll run
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showUnlockDlg && portalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !loading && setShowUnlockDlg(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center">
                <Unlock className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Unlock Payroll Run</h2>
                <p className="text-sm text-gray-500 mt-0.5">This will revert the payroll status to Approved.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowUnlockDlg(false)}
                disabled={loading === 'unlock'}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => action('unlock')}
                disabled={loading === 'unlock'}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading === 'unlock' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Unlocking…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Unlock className="w-3.5 h-3.5" /> Unlock Payroll
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      , portalTarget)}

      {showDeleteDlg && portalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !loading && setShowDeleteDlg(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Delete Payroll Run</h2>
                <p className="text-sm text-gray-500 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm">
              <p className="font-semibold text-red-800">{periodLabel}</p>
              <p className="text-red-600 mt-1">All payroll data for this run will be permanently deleted.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm
              </label>
              <input
                ref={inputRef}
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmed && deleteRun()}
                placeholder="DELETE"
                className="w-full border-2 rounded-lg px-3 py-2 text-sm font-mono outline-none transition-colors"
                style={{ borderColor: confirmed ? '#ef4444' : confirmText ? '#fca5a5' : '#e5e7eb' }}
                disabled={loading === 'delete'}
                autoComplete="off"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowDeleteDlg(false)} disabled={loading === 'delete'}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={deleteRun} disabled={!confirmed || loading === 'delete'}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: confirmed ? '#ef4444' : '#fca5a5' }}>
                {loading === 'delete' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Deleting…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> Delete Payroll Run
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      , portalTarget)}
    </>
  )
}
