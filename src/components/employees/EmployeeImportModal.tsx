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
import { Download, Upload, FileSpreadsheet, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface ImportError {
  row: number
  employeeNo: string
  error: string
}

interface ImportResult {
  imported: number
  skipped: number
  errors: ImportError[]
}

type ModalState = 'idle' | 'file-selected' | 'loading' | 'done'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function EmployeeImportModal({ open, onClose, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<ModalState>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const reset = useCallback(() => {
    setState('idle')
    setSelectedFile(null)
    setResult(null)
    setDragOver(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Please upload an Excel file (.xlsx)')
      return
    }
    setSelectedFile(file)
    setState('file-selected')
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFileSelect(file)
    },
    [handleFileSelect]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFileSelect(file)
    },
    [handleFileSelect]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleImport = useCallback(async () => {
    if (!selectedFile) return
    setState('loading')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch('/api/employees/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data.error ?? 'Import failed')
        setState('file-selected')
        return
      }

      setResult(data as ImportResult)
      setState('done')
    } catch {
      alert('An unexpected error occurred. Please try again.')
      setState('file-selected')
    }
  }, [selectedFile])

  const handleDone = useCallback(() => {
    if (result && result.imported > 0) {
      onSuccess()
    }
    handleClose()
  }, [result, onSuccess, handleClose])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#162d54]">
            <FileSpreadsheet className="w-5 h-5" />
            Bulk Import Employees
          </DialogTitle>
          <DialogDescription>
            Download the template, fill it in, then upload to import employees.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* Step 1: Download template */}
          {state !== 'done' && (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <p className="text-sm font-medium text-gray-800">Step 1: Download Template</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Fill in the Excel template with your employee data.
                </p>
              </div>
              <a href="/api/employees/import/template" download>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-[#162d54] text-[#162d54] hover:bg-[#162d54] hover:text-white"
                >
                  <Download className="mr-1.5 w-4 h-4" />
                  Download
                </Button>
              </a>
            </div>
          )}

          {/* Step 2: Upload */}
          {(state === 'idle' || state === 'file-selected') && (
            <div>
              <p className="text-sm font-medium text-gray-800 mb-2">Step 2: Upload Filled Template</p>
              <div
                className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
                  dragOver
                    ? 'border-accent bg-orange-50'
                    : state === 'file-selected'
                    ? 'border-[#162d54] bg-blue-50'
                    : 'border-gray-300 bg-white hover:border-[#162d54] hover:bg-gray-50'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleInputChange}
                />

                {state === 'file-selected' && selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="w-10 h-10 text-[#162d54]" />
                    <p className="text-sm font-medium text-[#162d54]">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(selectedFile.size / 1024).toFixed(1)} KB · Click to change
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-10 h-10 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">
                      Drag &amp; drop your .xlsx file here
                    </p>
                    <p className="text-xs text-gray-500">or click to browse</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loading state */}
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-10 h-10 animate-spin text-[#162d54]" />
              <p className="text-sm font-medium text-gray-700">Importing employees…</p>
              <p className="text-xs text-gray-500">This may take a few seconds.</p>
            </div>
          )}

          {/* Results */}
          {state === 'done' && result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-800">Import complete</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge className="bg-green-600 text-white">
                      {result.imported} imported
                    </Badge>
                    {result.skipped > 0 && (
                      <Badge variant="secondary">
                        {result.skipped} skipped (duplicates)
                      </Badge>
                    )}
                    {result.errors.length > 0 && (
                      <Badge className="bg-accent text-white">
                        {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Error table */}
              {result.errors.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-accent" />
                    <p className="text-sm font-medium text-gray-800">Rows with errors</p>
                  </div>
                  <div className="rounded-lg border border-red-200 overflow-hidden max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-red-800">Row</th>
                          <th className="px-3 py-2 text-left font-semibold text-red-800">Employee No</th>
                          <th className="px-3 py-2 text-left font-semibold text-red-800">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((e, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-red-50'}>
                            <td className="px-3 py-2 text-gray-700">{e.row}</td>
                            <td className="px-3 py-2 text-gray-700 font-medium">{e.employeeNo}</td>
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

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            {state === 'idle' && (
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            )}

            {state === 'file-selected' && (
              <>
                <Button variant="outline" onClick={reset}>
                  <X className="mr-1.5 w-4 h-4" />
                  Clear
                </Button>
                <Button
                  onClick={handleImport}
                  className="bg-[#162d54] hover:bg-[#0f1f3d] text-white"
                >
                  <Upload className="mr-1.5 w-4 h-4" />
                  Import
                </Button>
              </>
            )}

            {state === 'loading' && (
              <Button disabled className="bg-[#162d54] text-white">
                <Loader2 className="mr-1.5 w-4 h-4 animate-spin" />
                Importing…
              </Button>
            )}

            {state === 'done' && (
              <Button
                onClick={handleDone}
                className="bg-[#162d54] hover:bg-[#0f1f3d] text-white"
              >
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
