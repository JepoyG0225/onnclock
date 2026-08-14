'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type EmployeeDocument = {
  id: string
  documentType: string
  fileName: string
  fileUrl: string
  uploadedAt: string
  expiresAt: string | null
}

export function EmployeeDocumentsManager({ employeeId }: { employeeId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [documents, setDocuments] = useState<EmployeeDocument[]>([])
  const [documentType, setDocumentType] = useState('Government ID')
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/documents`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load documents')
      setDocuments(data.documents ?? [])
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
      setUploadOpen(false)
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

  return (
    <div className="space-y-4">
      <Button size="sm" className="absolute right-4 top-3" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" />Upload</Button>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="mb-1 block text-xs font-semibold">Document type</label><input value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Government ID" /></div>
            <div><label className="mb-1 block text-xs font-semibold">Expiration date</label><input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
            <div><label className="mb-1 block text-xs font-semibold">File</label><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" /></div>
            <div><label className="mb-1 block text-xs font-semibold">Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Optional notes" /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setUploadOpen(false)} disabled={saving}>Cancel</Button><Button disabled={saving || !file} onClick={upload}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Upload document</Button></div>
          </div>
        </DialogContent>
      </Dialog>

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
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-[#000000] hover:underline">
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
