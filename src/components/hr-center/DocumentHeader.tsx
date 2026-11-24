"use client"
import { useRef, useState } from 'react'
import { ImagePlus, Upload, Trash2, Loader2 } from 'lucide-react'
import { DocumentImageCrop } from './DocumentImageCrop'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { readDocumentHeader, type DocumentHeaderData } from '@/lib/hr-center/document-header'

export function DocumentHeader({ value, position = 'header' }: { value: unknown; position?: 'header' | 'footer' }) {
  const header = readDocumentHeader(value)
  if (!header.enabled) return null
  return <header className={`my-6 break-inside-avoid border-slate-200 ${position === 'footer' ? 'border-t pt-5' : 'border-b pb-5'}`} style={{ textAlign: header.alignment }}>
    {/* Uploaded raster images are stored with the document snapshot. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {header.image && <img src={header.image} alt={`Company ${position}`} className="inline-block max-h-40 max-w-full object-contain" />}
    {header.text && <div className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{header.text}</div>}
  </header>
}
export function DocumentHeaderEditor({ value, onChange, onBusy, position = 'header' }: { position?: 'header' | 'footer'; value: unknown; onChange: (value: DocumentHeaderData) => void; onBusy: (busy: boolean) => void }) {
  const header = readDocumentHeader(value)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const loading = cropFile !== null
  const fileInput = useRef<HTMLInputElement>(null)
  const update = (patch: Partial<DocumentHeaderData>) => onChange({ ...header, ...patch })
  async function upload(file: File) {
    if (!['image/png','image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error('Choose a PNG or JPEG image up to 5 MB.'); return }
    setCropFile(file); onBusy(true)
  }

  return <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-4">
    <label className="flex items-center gap-3 font-medium text-sm"><input type="checkbox" checked={header.enabled} disabled={loading} onChange={event => update({ enabled: event.target.checked })} />Add company {position}</label>
    <p className="text-xs text-slate-500">Include company details, a logo, or a letterhead image at the {position === 'footer' ? 'end' : 'top'} of the document. Issued copies keep the {position} saved at issuance.</p>
    {header.enabled && <>
      <label className="block text-sm">Company details<textarea className="mt-1 w-full rounded-lg border bg-white p-3" rows={3} maxLength={1500} placeholder="Company name, address, contact details" value={header.text} disabled={loading} onChange={event => update({ text: event.target.value })} /></label>
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">Logo / letterhead image</p>
        <input ref={fileInput} className="hidden" aria-label={`Upload company ${position} image`} type="file" accept="image/png,image/jpeg" disabled={loading} onChange={event => { const file=event.target.files?.[0];event.target.value='';if(file)void upload(file) }} />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-orange-200 bg-white p-5 sm:flex-row sm:flex-wrap">
          <div className="flex h-20 w-full shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 p-2 sm:w-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {header.image ? <img src={header.image} alt={`Selected company ${position} image`} className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-7 w-7 text-accent" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1 space-y-1 text-center sm:text-left">
            <p className="text-sm font-semibold text-primary">{header.image ? 'Your image is ready' : 'Add your company branding'}</p>
            <p className="text-xs leading-5 text-slate-500">PNG or JPEG, up to 5 MB.<br />Wide images work best for letterheads.</p>
            {loading && <p role="status" className="text-xs text-primary">Adjust the crop below, then apply your image.</p>}
          </div>
          <div className="flex shrink-0 flex-wrap justify-center gap-2">
            <Button type="button" size="sm" disabled={loading} onClick={()=>fileInput.current?.click()}>{loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}{header.image ? 'Replace image' : 'Upload image'}</Button>
            {header.image && <Button type="button" size="sm" variant="outline" disabled={loading} onClick={()=>update({image:''})}><Trash2 className="h-4 w-4" aria-hidden="true" />Remove</Button>}
          </div>
        </div>
      </div>
      {cropFile && <DocumentImageCrop key={`${cropFile.name}:${cropFile.lastModified}`} file={cropFile} onCancel={()=>{setCropFile(null);onBusy(false)}} onApply={image=>{update({image});setCropFile(null);onBusy(false)}} />}
      <label className="block text-sm">Alignment<select className="ml-3 rounded-lg border bg-white p-2" value={header.alignment} disabled={loading} onChange={event => update({ alignment: event.target.value as DocumentHeaderData['alignment'] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <div className="rounded-lg border bg-white px-5"><DocumentHeader value={header} position={position} /></div>
    </>}
  </section>
}
