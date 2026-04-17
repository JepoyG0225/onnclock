'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

type EmployeeDocument = {
  id: string
  documentType: string
  fileName: string
  fileUrl: string
  uploadedAt: string
  expiresAt: string | null
}

type StorageInfo = {
  usedBytes: number
  limitBytes: number
  remainingBytes: number
  usedLabel: string
  limitLabel: string
  remainingLabel: string
  pricePerSeat: number
}

export function EmployeeDocumentsManager({ employeeId }: { employeeId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [documents, setDocuments] = useState<EmployeeDocument[]>([])
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [documentType, setDocumentType] = useState('Government ID')
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/documents`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load documents')
      setDocuments(data.documents ?? [])
      setStorage(data.storage ?? null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => { void load() }, [load])

  async function upload() {
    if (!file) {
      toast.error('Select a file first')
      return
    }
    if (!documentType.trim()) {
      toast.error('Document type is required')
      return
    }

    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('documentType', documentType)
      if (expiresAt) fd.append('expiresAt', expiresAt)
      if (notes.trim()) fd.append('notes', notes.trim())
      fd.append('file', file)

      const res = await fetch(`/api/employees/${employeeId}/documents`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed')

      toast.success('Document uploaded')
      setFile(null)
      setNotes('')
      setExpiresAt('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setSaving(false)
    }
  }

  async function removeDocument(docId: string) {
    try {
      const res = await fetch(`/api/employees/${employeeId}/documents/${docId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Delete failed')
      toast.success('Document deleted')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const usagePct = storage?.limitBytes ? Math.min(100, (storage.usedBytes / storage.limitBytes) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Company document storage</p>
            <p className="text-xs text-slate-600">
              Plan rate: Php {Number(storage?.pricePerSeat ?? 0).toFixed(2)} / seat
            </p>
          </div>
          <p className="text-xs font-medium text-slate-600">
            {storage ? `${storage.usedLabel} / ${storage.limitLabel}` : '-'}
          </p>
        </div>
        <div className="h-2 rounded-full bg-slate-200 mt-3 overflow-hidden">
          <div className="h-2 rounded-full bg-[#2E4156]" style={{ width: `${usagePct}%` }} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-800">Upload document</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Document type"
          />
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
          />
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Notes (optional)"
        />
        <button
          disabled={saving}
          onClick={upload}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[#1A2D42] disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Upload
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-4 text-sm text-slate-500">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">No documents uploaded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">File</th>
                <th className="text-left px-3 py-2">Uploaded</th>
                <th className="text-left px-3 py-2">Expires</th>
                <th className="text-left px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b">
                  <td className="px-3 py-2">{doc.documentType}</td>
                  <td className="px-3 py-2">
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-[#2E4156] hover:underline">
                      {doc.fileName}
                    </a>
                  </td>
                  <td className="px-3 py-2">{new Date(doc.uploadedAt).toLocaleDateString('en-PH')}</td>
                  <td className="px-3 py-2">{doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString('en-PH') : '-'}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => removeDocument(doc.id)}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
