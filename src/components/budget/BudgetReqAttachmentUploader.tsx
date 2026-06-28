'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Paperclip, Loader2 } from 'lucide-react'

/**
 * Lets an HR/admin add an attachment to a budget requisition — including an
 * already-APPROVED one (e.g. attaching the receipt/liquidation after the fact).
 * The API (POST /api/budget-requisitions/[id]/attachments) already allows HR
 * roles to upload regardless of status; this surfaces it in the detail dialog.
 */
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx'
const MAX_ATTACHMENTS = 10

export function BudgetReqAttachmentUploader({
  requisitionId,
  count,
}: {
  requisitionId: string
  count: number
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/budget-requisitions/${requisitionId}/attachments`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Failed to add attachment')
        return
      }
      toast.success('Attachment added')
      router.refresh()
    } catch {
      toast.error('Failed to add attachment')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (count >= MAX_ATTACHMENTS) {
    return <p className="mt-2 text-xs text-slate-400">Maximum {MAX_ATTACHMENTS} attachments reached.</p>
  }

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handlePick}
        disabled={uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        {uploading ? 'Uploading…' : 'Add attachment'}
      </button>
      <p className="mt-1 text-[11px] text-slate-400">PDF, image, Word or Excel · up to 20 MB</p>
    </div>
  )
}
