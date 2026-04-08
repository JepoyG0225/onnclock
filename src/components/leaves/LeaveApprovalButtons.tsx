'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Check, X, Loader2 } from 'lucide-react'

export function LeaveApprovalButtons({
  requestId,
  canApprove,
  disabledReason,
}: {
  requestId: string
  canApprove: boolean
  disabledReason?: string
}) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')
  const router = useRouter()

  async function handle(action: 'approve' | 'reject', notes?: string) {
    setLoading(action)
    try {
      const res = await fetch(`/api/leaves/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Action failed')
        return
      }
      toast.success(action === 'approve' ? 'Leave approved!' : 'Leave rejected')
      setShowRejectModal(false)
      router.refresh()
    } catch {
      toast.error('An error occurred')
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <div className="flex gap-2 justify-center">
        <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50"
          onClick={() => handle('approve')}
          disabled={loading !== null || !canApprove}
          title={!canApprove ? (disabledReason ?? 'Approval not available yet') : undefined}
        >
          {loading === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </Button>
        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
          onClick={() => setShowRejectModal(true)}
          disabled={loading !== null || !canApprove}
          title={!canApprove ? (disabledReason ?? 'Approval not available yet') : undefined}
        >
          {loading === 'reject' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowRejectModal(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Reject Leave Request</h3>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Reason / Notes (optional)
              </label>
              <textarea
                value={rejectNotes}
                onChange={e => setRejectNotes(e.target.value)}
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
                placeholder="Explain the reason for rejection..."
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowRejectModal(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => handle('reject', rejectNotes)} disabled={loading === 'reject'}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {loading === 'reject' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
