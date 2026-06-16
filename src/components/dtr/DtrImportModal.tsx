'use client'

import { useRef, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, Upload, FileSpreadsheet, X, Loader2, CheckCircle2, AlertCircle, ClipboardPaste } from 'lucide-react'

interface RowResult { row: number; employee: string; status: 'imported' | 'error'; error?: string }
interface ImportResult { imported: number; failed: number; results: RowResult[] }

type ModalState = 'idle' | 'file-selected' | 'loading' | 'done'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  /** Company-scoped POST endpoint, e.g. withCompanyQuery('/api/dtr/bulk'). */
  endpoint: string
}

const HEADERS = ['employeeNo', 'date', 'timeIn', 'timeOut', 'remarks']

function buildTemplate(): string {
  return [
    HEADERS.join(','),
    '1001,2026-06-01,08:00,17:00,',
    '1002,2026-06-01,08:30,17:30,Late approved',
    '1003,2026-06-01,,,Absent',
  ].join('\n')
}

// Minimal CSV → rows. First line may be a header (auto-detected).
function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const firstLower = lines[0].toLowerCase()
  const start = firstLower.includes('employee') && firstLower.includes('date') ? 1 : 0
  const rows: { employeeNo: string; date: string; timeIn: string; timeOut: string; remarks: string }[] = []
  for (let i = start; i < lines.length; i++) {
    const [employeeNo = '', date = '', timeIn = '', timeOut = '', ...rest] = lines[i].split(',').map(c => c.trim())
    if (!employeeNo && !date) continue
    rows.push({ employeeNo, date, timeIn, timeOut, remarks: rest.join(',').trim() })
  }
  return rows
}

export function DtrImportModal({ open, onClose, onSuccess, endpoint }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<ModalState>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [csvText, setCsvText] = useState('')
  const [rowCount, setRowCount] = useState(0)
  const [pasteMode, setPasteMode] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const reset = useCallback(() => {
    setState('idle')
    setFileName(null)
    setCsvText('')
    setRowCount(0)
    setPasteMode(false)
    setDragOver(false)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleClose = useCallback(() => { reset(); onClose() }, [reset, onClose])

  const acceptText = useCallback((text: string, name: string | null) => {
    const rows = parseCsv(text)
    setCsvText(text)
    setRowCount(rows.length)
    setFileName(name)
    setResult(null)
    setState(rows.length > 0 ? 'file-selected' : 'idle')
  }, [])

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please upload a .csv file (or use Paste).')
      return
    }
    acceptText(await file.text(), file.name)
  }, [acceptText])

  const downloadTemplate = useCallback(() => {
    const url = URL.createObjectURL(new Blob([buildTemplate()], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'dtr-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleImport = useCallback(async () => {
    const rows = parseCsv(csvText)
    if (rows.length === 0) return
    setState('loading')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data?.error ?? 'Import failed')
        setState('file-selected')
        return
      }
      setResult({ imported: data.imported ?? 0, failed: data.failed ?? 0, results: data.results ?? [] })
      setState('done')
    } catch {
      alert('An unexpected error occurred. Please try again.')
      setState('file-selected')
    }
  }, [csvText, endpoint])

  const handleDone = useCallback(() => {
    if (result && result.imported > 0) onSuccess()
    handleClose()
  }, [result, onSuccess, handleClose])

  const errors = result?.results.filter(r => r.status === 'error') ?? []

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#162d54]">
            <FileSpreadsheet className="w-5 h-5" />
            Bulk Import DTR Entries
          </DialogTitle>
          <DialogDescription>
            Download the template, fill it in, then upload to import time records.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* Step 1: Template */}
          {state !== 'done' && (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <p className="text-sm font-medium text-gray-800">Step 1: Download Template</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Columns: employeeNo, date (YYYY-MM-DD), timeIn, timeOut (HH:mm), remarks.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={downloadTemplate}
                className="border-[#162d54] text-[#162d54] hover:bg-[#162d54] hover:text-white shrink-0"
              >
                <Download className="mr-1.5 w-4 h-4" />
                Download
              </Button>
            </div>
          )}

          {/* Step 2: Upload / paste */}
          {(state === 'idle' || state === 'file-selected') && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-800">Step 2: Upload Filled Template</p>
                <button
                  type="button"
                  onClick={() => { setPasteMode(p => !p); }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#162d54] hover:underline"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  {pasteMode ? 'Use file upload' : 'Paste instead'}
                </button>
              </div>

              {pasteMode ? (
                <textarea
                  value={csvText}
                  onChange={e => acceptText(e.target.value, null)}
                  placeholder={'employeeNo,date,timeIn,timeOut,remarks\n1001,2026-06-01,08:00,17:00,'}
                  className="w-full h-40 border border-gray-200 rounded-lg p-3 text-sm font-mono outline-none focus:border-[#162d54]"
                />
              ) : (
                <div
                  className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
                    dragOver
                      ? 'border-[#ff5900] bg-orange-50'
                      : state === 'file-selected'
                      ? 'border-[#162d54] bg-blue-50'
                      : 'border-gray-300 bg-white hover:border-[#162d54] hover:bg-gray-50'
                  }`}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                  {state === 'file-selected' ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileSpreadsheet className="w-10 h-10 text-[#162d54]" />
                      <p className="text-sm font-medium text-[#162d54]">{fileName ?? 'Pasted data'}</p>
                      <p className="text-xs text-gray-500">{rowCount} row{rowCount === 1 ? '' : 's'} detected · Click to change</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-10 h-10 text-gray-400" />
                      <p className="text-sm font-medium text-gray-700">Drag &amp; drop your .csv file here</p>
                      <p className="text-xs text-gray-500">or click to browse</p>
                    </div>
                  )}
                </div>
              )}

              {state === 'file-selected' && rowCount > 0 && (
                <p className="text-xs text-gray-500 mt-2">{rowCount} row{rowCount === 1 ? '' : 's'} ready to import.</p>
              )}
            </div>
          )}

          {/* Loading */}
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-10 h-10 animate-spin text-[#162d54]" />
              <p className="text-sm font-medium text-gray-700">Importing DTR records…</p>
              <p className="text-xs text-gray-500">This may take a few seconds.</p>
            </div>
          )}

          {/* Results */}
          {state === 'done' && result && (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 rounded-lg border p-4 ${result.imported > 0 ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                {result.imported > 0
                  ? <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  : <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />}
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${result.imported > 0 ? 'text-green-800' : 'text-amber-800'}`}>
                    {result.imported > 0 ? 'Import complete' : 'Nothing imported'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge className="bg-green-600 text-white">{result.imported} imported</Badge>
                    {result.failed > 0 && (
                      <Badge className="bg-[#ff5900] text-white">{result.failed} failed</Badge>
                    )}
                  </div>
                </div>
              </div>

              {errors.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-[#ff5900]" />
                    <p className="text-sm font-medium text-gray-800">Rows with errors</p>
                  </div>
                  <div className="rounded-lg border border-red-200 overflow-hidden max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-red-800">Row</th>
                          <th className="px-3 py-2 text-left font-semibold text-red-800">Employee</th>
                          <th className="px-3 py-2 text-left font-semibold text-red-800">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errors.map((e, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-red-50'}>
                            <td className="px-3 py-2 text-gray-700">{e.row}</td>
                            <td className="px-3 py-2 text-gray-700 font-medium">{e.employee}</td>
                            <td className="px-3 py-2 text-red-700">{e.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            {(state === 'idle') && (
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
            )}
            {state === 'file-selected' && (
              <>
                <Button variant="outline" onClick={reset}>
                  <X className="mr-1.5 w-4 h-4" /> Clear
                </Button>
                <Button onClick={handleImport} className="bg-[#162d54] hover:bg-[#0f1f3d] text-white">
                  <Upload className="mr-1.5 w-4 h-4" /> Import {rowCount > 0 ? `(${rowCount})` : ''}
                </Button>
              </>
            )}
            {state === 'loading' && (
              <Button disabled className="bg-[#162d54] text-white">
                <Loader2 className="mr-1.5 w-4 h-4 animate-spin" /> Importing…
              </Button>
            )}
            {state === 'done' && (
              <Button onClick={handleDone} className="bg-[#162d54] hover:bg-[#0f1f3d] text-white">Done</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
