'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  id: string
  title: string
  amount: string
}

export function BudgetReqActionButtons({ id, title, amount }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [reviewNote, setReviewNote] = useState('')

  async function doAction(status: 'APPROVED' | 'REJECTED', note?: string) {
    setLoading(status === 'APPROVED' ? 'approve' : 'reject')
    try {
      await fetch(`/api/budget-requisitions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewNote: note ?? null }),
      })
      router.refresh()
    } catch { /* ignore */ } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          onClick={() => doAction('APPROVED')}
          disabled={loading !== null}
          className="gap-1 text-xs h-7 px-2.5"
          style={{ background: '#16a34a', color: '#fff' }}
        >
          {loading === 'approve'
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <CheckCircle className="w-3 h-3" />}
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowRejectModal(true)}
          disabled={loading !== null}
          className="gap-1 text-xs h-7 px-2.5 border-red-200 text-red-600 hover:bg-red-50"
        >
          {loading === 'reject'
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <XCircle className="w-3 h-3" />}
          Reject
        </Button>
      </div>

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <div>
              <h3 className="font-bold text-gray-900 text-base">Reject Requisition</h3>
              <p className="text-xs text-gray-500 mt-1 line-clamp-1">{title} — {amount}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Review Note <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 resize-none transition"
                placeholder="Reason for rejection..."
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 text-sm" onClick={() => setShowRejectModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-1.5 text-sm"
                style={{ background: '#dc2626', color: '#fff' }}
                disabled={loading === 'reject'}
                onClick={async () => {
                  await doAction('REJECTED', reviewNote)
                  setShowRejectModal(false)
                  setReviewNote('')
                }}
              >
                {loading === 'reject' && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
