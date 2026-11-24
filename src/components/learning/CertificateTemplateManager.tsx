'use client'
import { AppSpinner } from '@/components/ui/AppSpinner'


import { resizeCertificateField } from '@/lib/learning/certificate-resize'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, FileImage, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { certificateIssueDate, formatCertificateDate } from '@/lib/learning/certificate-date'
import { certificateFont, certificateFonts, type CertificateFontId } from '@/lib/learning/certificate-fonts'
import { certificateVariables, fillCertificateText, templateFieldsSchema, type CertificateField } from '@/lib/learning/certificate-template'

type Template = { id: string; name: string; width: number; height: number; fields: CertificateField[]; previewUrl: string; updatedAt: string }
type Course = { id: string; title: string; certificateTemplateId?: string | null }
const sampleValues = { employee_name: 'Juan Dela Cruz', employee_number: 'EMP-001', company_name: 'Your Company', course_title: 'Course Completion', issued_date: formatCertificateDate(certificateIssueDate()), expiry_date: 'October 15, 2027', credential_id: 'SAMPLE-001' }

export function CertificateTemplateManager({ courses, onSaved }: { courses: Course[]; onSaved: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [draft, setDraft] = useState<Template | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const [newTemplateOpen, setNewTemplateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [courseId, setCourseId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [fieldType, setFieldType] = useState('employee_name')
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string; x: number; y: number; originX: number; originY: number; originWidth: number; mode: 'move' | 'left' | 'right'; pointerId: number } | null>(null)
  const active = draft?.fields.find(f => f.id === selected)
  async function load(selectId?: string) {
    const response = await fetch('/api/learning/certificate-templates')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not load templates.')
    setTemplates(data.templates)
    if (selectId) { setDraft(data.templates.find((t: Template) => t.id === selectId) ?? null); setSelected(''); setDirty(false) }
    setLoadError('')
  }
  useEffect(() => { void load().catch(err => setLoadError(err.message)).finally(() => setLoading(false)) }, [])
  function editField(id: string, changes: Partial<CertificateField>) {
    setDraft(d => d ? { ...d, fields: d.fields.map(f => f.id === id ? { ...f, ...changes } : f) } : d)
    setDirty(true)
  }
  function addField() {
    if (!draft || draft.fields.length >= 30) return
    const id = crypto.randomUUID()
    const field: CertificateField = { id, text: fieldType === 'custom' ? 'Your text here' : `{{${fieldType}}}`, x: 10, y: 45, width: 80, fontSize: 28, fontFamily: 'montserrat', bold: fieldType === 'employee_name', color: '#172554', align: 'center' }
    setDraft({ ...draft, fields: [...draft.fields, field] }); setSelected(id); setDirty(true)
  }
  async function upload() {
    if (busy || !file || !newName.trim()) return
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 4 * 1024 * 1024) return toast.error('Choose a PNG or JPG image up to 4 MB.')
    setBusy(true)
    try {
      const body = new FormData(); body.append('name', newName); body.append('file', file)
      const res = await fetch('/api/learning/certificate-templates', { method: 'POST', body })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Template upload failed.')
      await load(data.template.id); setNewTemplateOpen(false); setNewName(''); setFile(null); onSaved(); toast.success('Background uploaded. Add fields and save your layout.')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not upload template.') }
    finally { setBusy(false) }
  }
  async function save() {
    if (!draft) return
    const parsed = templateFieldsSchema.safeParse(draft.fields)
    if (!parsed.success) return toast.error(parsed.error.issues[0].message)
    setBusy(true)
    try {
      const res = await fetch('/api/learning/certificate-templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draft.id, name: draft.name, fields: draft.fields, ...(courseId ? { courseId } : {}) }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save template.')
      await load(); setDraft(null); setSelected(''); setDirty(false); setCourseId(''); onSaved(); toast.success('Certificate template saved')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not save template.') }
    finally { setBusy(false) }
  }
  const input = 'h-9 rounded-md border bg-white px-2 text-sm'
  return <Card className="mb-5"><CardHeader><CardTitle>Company certificate templates</CardTitle><p className="text-sm text-gray-500">Upload your blank certificate, place variables over it, and reuse the layout for employees. Export PDF artwork as a PNG or JPG before uploading.</p></CardHeader>
    <CardContent className="space-y-4">
      <Dialog open={newTemplateOpen} onOpenChange={open => { if (busy) return; setNewTemplateOpen(open); if (!open) { setNewName(''); setFile(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New template</DialogTitle><DialogDescription>Upload your blank certificate background. You can place employee names and other fields after uploading.</DialogDescription></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); void upload() }} className="space-y-4">
            <label className="block space-y-1 text-sm"><span>Template name</span><Input autoFocus required maxLength={150} disabled={busy} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Company course certificate"/></label>
            <label className="block space-y-1 text-sm"><span>Certificate background</span><Input required disabled={busy} type="file" accept="image/png,image/jpeg" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
            <p className="text-xs text-slate-500">PNG or JPG, up to 4 MB. Export PDF artwork as an image before uploading.</p>
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => { setNewTemplateOpen(false); setNewName(''); setFile(null) }}>Cancel</Button><Button type="submit" disabled={busy || !file || !newName.trim()}>{busy ? 'Uploading...' : 'Create template'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {loading && <AppSpinner size="md" message="Loading templates…" className="py-8" />}
      {loadError && <p role="alert" className="text-sm text-red-600">{loadError} <button className="underline" onClick={() => void load().catch(err => setLoadError(err.message))}>Retry</button></p>}
      {!draft && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Saved templates ({templates.length})</h3><div className="flex flex-wrap gap-2"><Input aria-label="Search certificate templates" className="max-w-xs" placeholder="Search templates or linked courses" value={search} onChange={e => setSearch(e.target.value)}/><Button disabled={busy} onClick={() => setNewTemplateOpen(true)}><Plus className="mr-1 h-4 w-4"/>New template</Button></div></div>
        {!loading && !loadError && templates.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center"><FileImage className="mx-auto mb-2 h-8 w-8 text-slate-400"/><p className="text-sm text-slate-500">No certificate templates yet. Click New template to upload your first certificate background.</p></div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.filter(t => `${t.name} ${courses.filter(c => c.certificateTemplateId === t.id).map(c => c.title).join(' ')}`.toLowerCase().includes(search.toLowerCase())).map(t => {
          const linked = courses.filter(c => c.certificateTemplateId === t.id)
          return <article key={t.id} className="overflow-hidden rounded-xl border bg-white">
            <div className="flex aspect-[4/3] items-center justify-center border-b bg-slate-50 p-3"><svg viewBox={`0 0 ${t.width} ${t.height}`} className="h-full w-full" role="img" aria-label={`${t.name} template preview`}>
              <image href={t.previewUrl} x={0} y={0} width={t.width} height={t.height}/>
              {t.fields.map(f => { const width = f.width / 100 * t.width; return <text key={f.id} x={f.x / 100 * t.width + (f.align === 'center' ? width / 2 : f.align === 'right' ? width : 0)} y={f.y / 100 * t.height + f.fontSize} fontFamily={certificateFont(f.fontFamily).family} fontSize={f.fontSize} fontWeight={f.bold && certificateFont(f.fontFamily).bold ? 700 : 400} textAnchor={f.align === 'center' ? 'middle' : f.align === 'right' ? 'end' : 'start'} fill={f.color}>{fillCertificateText(f.text, sampleValues)}</text> })}
            </svg></div>
            <div className="space-y-3 p-4"><h4 className="break-words font-semibold">{t.name}</h4><div className="space-y-1 text-xs text-slate-500"><p>{t.fields.length} text field{t.fields.length === 1 ? '' : 's'} | {linked.length} linked course{linked.length === 1 ? '' : 's'}</p><p className="line-clamp-2">{linked.map(c => c.title).join(', ') || 'Not linked to a course'}</p><p>Updated {new Date(t.updatedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' })}</p></div>
              <div className="flex gap-2"><Button size="sm" disabled={busy} aria-label={`Edit ${t.name}`} onClick={() => { setDraft(t); setSelected(''); setCourseId(''); setDirty(false) }}><Pencil className="mr-1 h-3.5 w-3.5"/>Edit template</Button><Button asChild size="sm" variant="outline"><a href={`/api/learning/certificate-templates/${t.id}/preview`} target="_blank" rel="noreferrer" aria-label={`Preview ${t.name} PDF`}>PDF preview</a></Button></div>
            </div>
          </article>
        })}</div>
        {templates.length > 0 && !templates.some(t => `${t.name} ${courses.filter(c => c.certificateTemplateId === t.id).map(c => c.title).join(' ')}`.toLowerCase().includes(search.toLowerCase())) && <p className="py-6 text-center text-sm text-slate-500">No templates match your search.</p>}
      </>}
      {draft && <>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Editing: {draft.name}</h3><Button variant="outline" size="sm" disabled={busy} onClick={() => { if (dirty || courseId) { toast.error('Save or discard your changes before returning to the list.'); return } setDraft(null); setSelected('') }}><ArrowLeft className="mr-1 h-4 w-4"/>Back to templates</Button></div>
        <div className="flex flex-wrap items-center gap-2"><Input aria-label="Template name" className="max-w-xs" value={draft.name} onChange={e => { setDraft({ ...draft, name: e.target.value }); setDirty(true) }}/><select aria-label="Variable to add" className={input} value={fieldType} onChange={e => setFieldType(e.target.value)}>{Object.entries(certificateVariables).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="custom">Custom text</option></select><Button variant="outline" disabled={busy || draft.fields.length >= 30} onClick={addField}>Add field</Button></div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="self-start overflow-hidden rounded-lg border bg-white">
            <svg ref={svg} viewBox={`0 0 ${draft.width} ${draft.height}`} className="block w-full touch-none select-none" aria-label="Certificate layout. Select a field. Drag it to move, or drag its left or right edge to resize." onPointerMove={e => {
              if (busy || !drag.current || !svg.current || e.pointerId !== drag.current.pointerId) return
              const box = svg.current.getBoundingClientRect(); const field = draft.fields.find(f => f.id === drag.current?.id)
              if (!field) return
              if (box.width <= 0 || box.height <= 0) return
              if (drag.current.mode !== 'move') {
                editField(field.id, resizeCertificateField(drag.current.originX, drag.current.originWidth, drag.current.mode, (e.clientX - drag.current.x) / box.width * 100))
                return
              }
              editField(field.id, { x: Math.max(0, Math.min(100 - field.width, drag.current.originX + (e.clientX - drag.current.x) / box.width * 100)), y: Math.max(0, Math.min(100 - field.fontSize / draft.height * 100, drag.current.originY + (e.clientY - drag.current.y) / box.height * 100)) })
            }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}>
              <image href={draft.previewUrl} x={0} y={0} width={draft.width} height={draft.height}/>
              {draft.fields.map(f => {
                const x = f.x / 100 * draft.width, y = f.y / 100 * draft.height, width = f.width / 100 * draft.width
                return <g key={f.id} role="button" tabIndex={0} aria-label={`Select ${f.text}`} style={{ cursor: 'move' }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(f.id) } }} onPointerDown={e => { if(busy || drag.current || e.button !== 0)return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setSelected(f.id); drag.current = { id: f.id, x: e.clientX, y: e.clientY, originX: f.x, originY: f.y, originWidth: f.width, mode: 'move', pointerId: e.pointerId } }}>
                  <rect x={x} y={y} width={width} height={f.fontSize * 1.3} fill={selected === f.id ? '#dbeafe55' : 'transparent'} stroke={selected === f.id ? '#2563eb' : 'transparent'} strokeDasharray="4 3"/>
                  <text x={x + (f.align === 'center' ? width / 2 : f.align === 'right' ? width : 0)} y={y + f.fontSize} fontFamily={certificateFont(f.fontFamily).family} fontSize={f.fontSize} fontWeight={f.bold && certificateFont(f.fontFamily).bold ? 700 : 400} textAnchor={f.align === 'center' ? 'middle' : f.align === 'right' ? 'end' : 'start'} fill={f.color}>{fillCertificateText(f.text, sampleValues)}</text>
                  {selected === f.id && (['left', 'right'] as const).map(edge => {
                    const edgeX = edge === 'left' ? x : x + width
                    const handleWidth = draft.width * 0.012
                    const handleHeight = Math.max(f.fontSize * 1.3, draft.height * 0.025)
                    return <g key={edge} role="slider" tabIndex={0} aria-label={`Resize ${edge} edge of ${f.text}`} aria-valuemin={1} aria-valuemax={100} aria-valuenow={Number(f.width.toFixed(2))} aria-valuetext={`${f.width.toFixed(2)} percent wide`} style={{ cursor: 'ew-resize' }}
                      onKeyDown={e => {
                        if (busy || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return
                        e.preventDefault(); e.stopPropagation()
                        editField(f.id, resizeCertificateField(f.x, f.width, edge, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 0.5)))
                      }}
                      onPointerDown={e => {
                        e.stopPropagation()
                        if (busy || drag.current || e.button !== 0) return
                        e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId)
                        drag.current = { id: f.id, x: e.clientX, y: e.clientY, originX: f.x, originY: f.y, originWidth: f.width, mode: edge, pointerId: e.pointerId }
                      }}>
                      <rect x={edgeX - handleWidth * 1.5} y={y - handleHeight * 0.25} width={handleWidth * 3} height={handleHeight * 1.5} fill="transparent" />
                      <rect x={edgeX - handleWidth / 2} y={y + f.fontSize * 0.65 - handleHeight / 2} width={handleWidth} height={handleHeight} rx={handleWidth / 3} fill="white" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                    </g>
                  })}
                </g>
              })}
            </svg>
          </div>
          <div className="space-y-3 rounded-lg border p-3">{active ? <>
            <label className="block text-xs">Text or variable<Input value={active.text} onChange={e => editField(active.id, { text: e.target.value })}/></label>
            <div className="grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'fontSize'] as const).map(key => <label key={key} className="text-xs">{{ x: 'Left (%)', y: 'Top (%)', width: 'Width (%)', fontSize: 'Font size' }[key]}<Input type="number" min={key === 'fontSize' ? 8 : key === 'width' ? 1 : 0} max={key === 'fontSize' ? 96 : 100} step="0.5" value={Number(active[key].toFixed(2))} onChange={e => editField(active.id, { [key]: Number(e.target.value) })}/></label>)}</div>
            <label className="block text-xs">Font<select aria-label="Certificate field font" className={`${input} mt-1 w-full`} value={active.fontFamily ?? 'montserrat'} onChange={e => { const fontFamily = e.target.value as CertificateFontId; editField(active.id, { fontFamily, bold: certificateFont(fontFamily).bold ? active.bold : false }) }}>{Object.entries(certificateFonts).map(([id, font]) => <option key={id} value={id}>{font.label} - {font.style}</option>)}</select></label>
            <div className="rounded border bg-slate-50 px-2 py-3 text-center text-2xl" style={{ fontFamily: certificateFont(active.fontFamily).family, fontWeight: active.bold && certificateFont(active.fontFamily).bold ? 700 : 400 }}>Certificate of Excellence</div>
            <label className="block text-xs">Alignment<select className={`${input} mt-1 w-full`} value={active.align} onChange={e => editField(active.id, { align: e.target.value as CertificateField['align'] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
            <div className="flex items-center justify-between"><label className="text-xs">Text color <input aria-label="Text color" type="color" value={active.color} onChange={e => editField(active.id, { color: e.target.value })}/></label><label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={!certificateFont(active.fontFamily).bold} checked={Boolean(active.bold && certificateFont(active.fontFamily).bold)} onChange={e => editField(active.id, { bold: e.target.checked })}/>Bold</label></div>
            <Button size="sm" variant="outline" onClick={() => { setDraft({ ...draft, fields: draft.fields.filter(f => f.id !== active.id) }); setSelected(''); setDirty(true) }}>Remove field</Button>
          </> : <p className="text-sm text-gray-500">Add or select a field to change its size and position. Drag fields to move them. Drag the left or right handle to adjust width.</p>}</div>
        </div>
        <p className="text-xs text-gray-500">Select a field and drag either side handle to adjust its width. Arrow keys also resize a focused handle. The editor uses sample values. Date issued is filled automatically when a certificate is issued and remains fixed on later downloads. PDF downloads fill in the employee’s details and shrink long text to fit its field. Save and open PDF preview to check the final layout.</p>
        <div className="flex flex-wrap items-center gap-2"><label className="text-sm">Use for course <select className={`${input} max-w-full`} value={courseId} onChange={e => setCourseId(e.target.value)}><option value="">Save layout only</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><Button disabled={busy || !draft.name.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save template'}</Button>{dirty || courseId ? <Button variant="ghost" disabled={busy} onClick={() => { setDraft(templates.find(t => t.id === draft.id) ?? null); setDirty(false); setSelected(''); setCourseId('') }}>Discard changes</Button> : <Button asChild variant="outline"><a href={`/api/learning/certificate-templates/${draft.id}/preview`} target="_blank" rel="noreferrer">PDF preview</a></Button>}</div>
        <p className="text-xs text-gray-500">Linked courses: {courses.filter(c => c.certificateTemplateId === draft.id).map(c => c.title).join(', ') || 'None'}. Templates apply to newly issued certifications. Existing certificates keep their original layout.</p>
      </>}
    </CardContent>
  </Card>
}
