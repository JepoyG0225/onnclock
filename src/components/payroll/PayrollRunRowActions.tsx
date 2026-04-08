'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Trash2, Unlock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  runId: string
  status: string
}

export default function PayrollRunRowActions({ runId, status }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [showDeleteDlg, setShowDeleteDlg] = useState(false)
  const [showUnlockDlg, setShowUnlockDlg] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showDeleteDlg) {
      setConfirmText('')
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [showDeleteDlg])

  async function handleDelete() {
    if (confirmText.trim().toUpperCase() !== 'DELETE') return
    setLoading('delete')
    try {
      const res = await fetch(`/api/payroll/${runId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Payroll run deleted')
        router.refresh()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Delete failed')
      }
    } finally {
      setLoading(null)
      setShowDeleteDlg(false)
    }
  }

  async function handleUnlock() {
    setLoading('unlock')
    try {
      const res = await fetch(`/api/payroll/${runId}/unlock`, { method: 'POST' })
      if (res.ok) {
        toast.success('Payroll unlocked')
        router.refresh()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Unlock failed')
      }
    } finally {
      setLoading(null)
      setShowUnlockDlg(false)
    }
  }

  const confirmed = confirmText.trim().toUpperCase() === 'DELETE'

  const portalTarget = typeof document !== 'undefined' ? document.body : null

  return (
    <>
      <div className="flex items-center justify-center gap-1">
        {status === 'LOCKED' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-yellow-700 hover:bg-yellow-50"
            disabled={!!loading}
            onClick={() => setShowUnlockDlg(true)}
          >
            <Unlock className="w-4 h-4" />
          </Button>
        )}
        {status !== 'LOCKED' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50"
            disabled={!!loading}
            onClick={() => setShowDeleteDlg(true)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {showUnlockDlg && portalTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !loading && setShowUnlockDlg(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-full bg-yellow-100 flex items-center justify-center">
                <Unlock className="w-5 h-5 text-yellow-700" />
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
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUnlock}
                disabled={loading === 'unlock'}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#f59e0b' }}
              >
                {loading === 'unlock' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Unlocking...
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm
              </label>
              <input
                ref={inputRef}
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmed && handleDelete()}
                placeholder="DELETE"
                className="w-full border-2 rounded-lg px-3 py-2 text-sm font-mono outline-none transition-colors"
                style={{ borderColor: confirmed ? '#ef4444' : confirmText ? '#fca5a5' : '#e5e7eb' }}
                disabled={loading === 'delete'}
                autoComplete="off"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowDeleteDlg(false)}
                disabled={loading === 'delete'}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!confirmed || loading === 'delete'}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: confirmed ? '#ef4444' : '#fca5a5' }}
              >
                {loading === 'delete' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Deleting...
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
