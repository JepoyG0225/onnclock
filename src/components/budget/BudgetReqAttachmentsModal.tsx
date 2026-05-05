'use client'

import { useState } from 'react'
import { Paperclip, X, Download, FileText, FileImage, FileSpreadsheet, File } from 'lucide-react'

interface Attachment {
  id: string
  fileName: string
  fileUrl: string
  fileSize: number
  mimeType: string
}

interface Props {
  attachments: Attachment[]
  requisitionTitle: string
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/'))
    return <FileImage className="w-5 h-5 text-blue-500" />
  if (mimeType.includes('pdf'))
    return <FileText className="w-5 h-5 text-red-500" />
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('xls'))
    return <FileSpreadsheet className="w-5 h-5 text-green-600" />
  if (mimeType.includes('word') || mimeType.includes('document'))
    return <FileText className="w-5 h-5 text-blue-600" />
  return <File className="w-5 h-5 text-gray-400" />
}

export function BudgetReqAttachmentsModal({ attachments, requisitionTitle }: Props) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Attachment | null>(null)

  if (attachments.length === 0) return <span className="text-gray-300 text-xs">—</span>

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full
          bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors whitespace-nowrap"
      >
        <Paperclip className="w-3.5 h-3.5" />
        {attachments.length} file{attachments.length !== 1 ? 's' : ''}
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); setPreview(null) } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-orange-500" />
                <div>
                  <p className="text-sm font-bold text-gray-900">Attachments</p>
                  <p className="text-xs text-gray-400 truncate max-w-[280px]">{requisitionTitle}</p>
                </div>
              </div>
              <button
                onClick={() => { setOpen(false); setPreview(null) }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image preview strip */}
            {preview && preview.mimeType.startsWith('image/') && (
              <div className="border-b bg-gray-950 relative flex items-center justify-center" style={{ minHeight: 200, maxHeight: 300 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.fileUrl}
                  alt={preview.fileName}
                  className="object-contain max-h-[300px] max-w-full"
                />
                <button
                  onClick={() => setPreview(null)}
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <p className="absolute bottom-2 left-0 right-0 text-center text-white text-xs opacity-70">
                  {preview.fileName}
                </p>
              </div>
            )}

            {/* File list */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {attachments.map((att) => {
                const isImage = att.mimeType.startsWith('image/')
                const isActive = preview?.id === att.id
                return (
                  <div
                    key={att.id}
                    className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                      isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Icon / thumbnail */}
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden
                        ${isImage ? 'bg-gray-100 cursor-pointer' : 'bg-gray-50'}`}
                      onClick={() => isImage && setPreview(isActive ? null : att)}
                      title={isImage ? 'Click to preview' : undefined}
                    >
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={att.fileUrl}
                          alt={att.fileName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileIcon mimeType={att.mimeType} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{att.fileName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtSize(att.fileSize)}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isImage && (
                        <button
                          onClick={() => setPreview(isActive ? null : att)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                        >
                          {isActive ? 'Hide' : 'Preview'}
                        </button>
                      )}
                      <a
                        href={att.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={att.fileName}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {attachments.length} attachment{attachments.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={() => { setOpen(false); setPreview(null) }}
                className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
