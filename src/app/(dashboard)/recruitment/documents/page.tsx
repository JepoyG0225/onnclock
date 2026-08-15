'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowLeft, Bold, Check, Clipboard, FilePlus2, FileSignature, Italic, Loader2, Plus, Send, Trash2, Underline, Upload, X } from 'lucide-react'
import { AppSpinner } from '@/components/ui/AppSpinner'

type Signatory = { id: string; role: 'CANDIDATE' | 'COMPANY'; name: string; title: string; email: string; required: boolean }
type Template = { id: string; name: string; type: DocType; title: string; content: string; paperSize: PaperSize; signatories: Signatory[]; updatedAt: string }
type Document = { id: string; applicationId: string; title: string; type: DocType; status: string; publicToken: string; updatedAt: string }
type Application = { id: string; firstName: string; lastName: string; email: string; jobPost: { title: string } }
type DocType = 'JOB_OFFER' | 'EMPLOYMENT_CONTRACT' | 'OTHER'
type PaperSize = 'A4' | 'LETTER' | 'LEGAL'

const candidateSigner = (): Signatory => ({ id: crypto.randomUUID(), role: 'CANDIDATE', name: 'Candidate', title: 'Candidate', email: '', required: true })
const blankTemplate = () => ({ name: '', type: 'JOB_OFFER' as DocType, title: '', content: '', paperSize: 'A4' as PaperSize, signatories: [candidateSigner()] })
const variables = ['candidate_name', 'candidate_email', 'job_title', 'department', 'location', 'company_name', 'issue_date']
const paperDimensions: Record<PaperSize, { label: string; width: number; minHeight: number }> = { A4: { label: 'A4', width: 794, minHeight: 1123 }, LETTER: { label: 'Letter', width: 816, minHeight: 1056 }, LEGAL: { label: 'Legal', width: 816, minHeight: 1344 } }
const richTextMarker = '<!--contract-rich-->'
const pageBreakMarker = '<!--page-break-->'

function escapeHtml(value: string) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') }

function paginateContent(content: string, paperSize: PaperSize) {
  const { width, minHeight } = paperDimensions[paperSize]
  const horizontalPadding = Math.round(width * 0.09) * 2
  const verticalPadding = Math.round(minHeight * 0.08) * 2
  const charactersPerLine = Math.max(45, Math.floor((width - horizontalPadding) / 7.4))
  const linesPerPage = Math.max(12, Math.floor((minHeight - verticalPadding) / 28))
  const pages: Array<{ start: number; end: number; text: string }> = []
  let pageStart = 0, line = 1, column = 0

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    if (character === '\n') { line += 1; column = 0 } else {
      column += character === '\t' ? 4 : 1
      if (column > charactersPerLine) { line += 1; column = 1 }
    }
    if (line > linesPerPage) {
      pages.push({ start: pageStart, end: index, text: content.slice(pageStart, index) })
      pageStart = index
      line = 1
      column = character === '\n' ? 0 : 1
    }
  }
  pages.push({ start: pageStart, end: content.length, text: content.slice(pageStart) })
  return pages
}

async function responseJson(response: Response) {
  const text = await response.text()
  if (!text) return { error: response.ok ? '' : `Request failed (HTTP ${response.status}).` }
  try { return JSON.parse(text) } catch { return { error: `The server returned an invalid response (HTTP ${response.status}).` } }
}

export default function RecruitmentDocumentsPage() {
  const [templates, setTemplates] = useState<Template[]>([]), [documents, setDocuments] = useState<Document[]>([]), [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [editorOpen, setEditorOpen] = useState(false), [issueOpen, setIssueOpen] = useState(false)
  const [form, setForm] = useState(blankTemplate()), [editingId, setEditingId] = useState<string | null>(null), [saving, setSaving] = useState(false)
  const [applicationId, setApplicationId] = useState(''), [templateId, setTemplateId] = useState(''), [expiresAt, setExpiresAt] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const [t, d, a] = await Promise.all([fetch('/api/recruitment/document-templates'), fetch('/api/recruitment/documents'), fetch('/api/recruitment/applications')])
      const [tb, db, ab] = await Promise.all([responseJson(t), responseJson(d), responseJson(a)])
      if (!t.ok || !d.ok || !a.ok) throw new Error(tb.error || db.error || ab.error || 'Could not load recruitment documents.')
      setTemplates(tb.templates ?? []); setDocuments(db.documents ?? []); setApplications(ab.applications ?? [])
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load recruitment documents.') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const chosen = useMemo(() => templates.find(item => item.id === templateId), [templates, templateId])
  const customVariables = useMemo(() => { const found = new Set<string>(); `${chosen?.title ?? ''} ${chosen?.content ?? ''}`.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, key: string) => { if (!variables.includes(key.toLowerCase())) found.add(key.toLowerCase()); return '' }); return [...found] }, [chosen])

  function edit(template?: Template) { setEditingId(template?.id ?? null); setForm(template ? { name: template.name, type: template.type, title: template.title, content: template.content, paperSize: template.paperSize ?? 'A4', signatories: template.signatories } : blankTemplate()); setEditorOpen(true) }
  function addCompanySigner() { setForm(current => ({ ...current, signatories: [...current.signatories, { id: crypto.randomUUID(), role: 'COMPANY', name: '', title: '', email: '', required: true }] })) }
  function updateSigner(id: string, field: keyof Signatory, value: string | boolean) { setForm(current => ({ ...current, signatories: current.signatories.map(s => s.id === id ? { ...s, [field]: value } : s) })) }

  async function saveTemplate() {
    setSaving(true); setError('')
    try { const response = await fetch('/api/recruitment/document-templates', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, id: editingId ?? undefined }) }); const body = await responseJson(response); if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Check all template fields.'); setEditorOpen(false); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save template.') } finally { setSaving(false) }
  }

  async function issueDocument() {
    if (!chosen || !applicationId) return
    setSaving(true); setError('')
    try {
      const create = await fetch('/api/recruitment/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId, templateId: chosen.id, type: chosen.type, title: chosen.title, content: chosen.content, paperSize: chosen.paperSize, signatories: chosen.signatories, expiresAt: expiresAt || null, variables: customValues }) })
      const created = await responseJson(create); if (!create.ok) throw new Error(created.error || 'Unable to create document.')
      const send = await fetch('/api/recruitment/documents', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: created.document.id, action: 'SEND' }) })
      const sent = await responseJson(send); if (!send.ok) throw new Error(sent.error || 'Unable to issue document.')
      await navigator.clipboard?.writeText(`${window.location.origin}${sent.signingUrl}`)
      setIssueOpen(false); setApplicationId(''); setTemplateId(''); setExpiresAt(''); setCustomValues({}); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to issue document.') } finally { setSaving(false) }
  }

  function insertVariable(variable: string) {
    const token = `{{${variable}}}`
    const editor = contentRef.current
    if (!editor) return setForm(current => ({ ...current, content: `${current.content}${token}` }))
    editor.focus()
    document.execCommand('insertText', false, token)
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: token }))
  }

  async function importDocument(file?: File) {
    if (!file) return
    setImporting(true); setError('')
    try {
      const data = new FormData(); data.set('file', file)
      const response = await fetch('/api/recruitment/document-templates/import', { method: 'POST', body: data })
      const body = await responseJson(response)
      if (!response.ok) throw new Error(body.error || 'Unable to convert document.')
      setForm(current => ({ ...current, name: current.name || body.fileName, title: current.title || body.fileName, content: body.content }))
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to convert document.') } finally { setImporting(false) }
  }

  return <main className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/recruitment" className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#2563eb]"><ArrowLeft className="h-3.5 w-3.5" />Recruitment</Link><h1 className="text-2xl font-black text-slate-950">Offers & Contracts</h1><p className="mt-1 text-sm text-slate-500">Create reusable documents, configure signatories, and collect secure e-signatures.</p></div><div className="flex gap-2"><button onClick={() => edit()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-[#bfdbfe] hover:bg-[#f4f8ff]"><Plus className="h-4 w-4 text-[#2563eb]" />New template</button><button onClick={() => setIssueOpen(true)} disabled={!templates.length} className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"><Send className="h-4 w-4" />Issue document</button></div></header>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
    {loading ? <div className="flex h-56 items-center justify-center"><AppSpinner size="md" /></div> : <>
      <section><h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-500">Templates</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.map(t => <button key={t.id} onClick={() => edit(t)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#bfdbfe] hover:shadow"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]"><FileSignature className="h-5 w-5" /></span><h3 className="mt-4 font-black text-slate-950">{t.name}</h3><p className="mt-1 text-xs text-slate-500">{t.type.replaceAll('_', ' ')} · {t.signatories.length} signator{t.signatories.length === 1 ? 'y' : 'ies'}</p></button>)}{!templates.length && <Empty text="Create your first job offer or employment contract template." />}</div></section>
      <section><h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-500">Issued documents</h2><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{documents.map(d => <div key={d.id} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-bold text-slate-900">{d.title}</p><p className="text-xs text-slate-500">{d.type.replaceAll('_', ' ')}</p></div><Status value={d.status} /><button onClick={() => navigator.clipboard.writeText(`${location.origin}/sign/${d.publicToken}`)} className="inline-flex items-center gap-1 text-xs font-bold text-[#2563eb]"><Clipboard className="h-3.5 w-3.5" />Copy link</button></div>)}{!documents.length && <div className="p-5"><Empty text="Issued offers and contracts will appear here." /></div>}</div></section>
    </>}
    {editorOpen && <Modal title={editingId ? 'Edit template' : 'New document template'} onClose={() => setEditorOpen(false)} fullPage>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#bfdbfe] bg-[#eff6ff] px-4 py-4 text-sm font-bold text-[#1d4ed8] transition hover:bg-[#dbeafe]">
        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{importing ? 'Converting document...' : 'Upload PDF, DOC, or DOCX'}
        <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" disabled={importing} onChange={event => { void importDocument(event.target.files?.[0]); event.target.value = '' }} />
      </label>
      <p className="text-center text-[11px] text-slate-400">Imported text remains fully editable before the template is saved.</p>
      <div className="grid gap-4 sm:grid-cols-3"><Field label="Template name"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" /></Field><Field label="Document type"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as DocType })} className="input"><option value="JOB_OFFER">Job offer</option><option value="EMPLOYMENT_CONTRACT">Employment contract</option><option value="OTHER">Other</option></select></Field><Field label="Paper size"><select value={form.paperSize} onChange={e => setForm({ ...form, paperSize: e.target.value as PaperSize })} className="input">{(Object.keys(paperDimensions) as PaperSize[]).map(size => <option key={size} value={size}>{paperDimensions[size].label}</option>)}</select></Field></div>
      <Field label="Document title"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input" /></Field>
      <PaginatedEditor content={form.content} paperSize={form.paperSize} contentRef={contentRef} onChange={content => setForm(current => ({ ...current, content }))} />
      <div><p className="mb-2 text-xs font-bold text-slate-600">Insert a variable at the cursor</p><div className="flex flex-wrap gap-1.5">{variables.map(variable => <button key={variable} type="button" onClick={() => insertVariable(variable)} className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-1.5 font-mono text-[10px] font-bold text-[#1d4ed8] hover:border-[#60a5fa]">{`{{${variable}}}`}</button>)}</div><p className="mt-2 text-[11px] text-slate-400">You can also type a custom variable such as {'{{monthly_salary}}'} or {'{{start_date}}'}. Its value will be requested when the document is issued.</p></div>
      <div className="flex items-center justify-between"><div><h3 className="text-sm font-black text-slate-900">Signatories</h3><p className="text-xs text-slate-500">Candidate details are filled automatically when issued.</p></div><button onClick={addCompanySigner} className="text-xs font-bold text-[#2563eb]">+ Add company signer</button></div><div className="space-y-3">{form.signatories.map(s => <div key={s.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[100px_1fr_1fr_36px]"><span className="self-center text-xs font-black text-slate-500">{s.role}</span><input value={s.name} disabled={s.role === 'CANDIDATE'} onChange={e => updateSigner(s.id, 'name', e.target.value)} placeholder="Name" className="input bg-white" /><input value={s.title} onChange={e => updateSigner(s.id, 'title', e.target.value)} placeholder="Title / role" className="input bg-white" />{s.role === 'COMPANY' ? <button onClick={() => setForm({ ...form, signatories: form.signatories.filter(x => x.id !== s.id) })} className="text-red-500"><Trash2 className="h-4 w-4" /></button> : <span />}</div>)}</div><button disabled={saving} onClick={saveTemplate} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-black text-white transition hover:bg-[#1d4ed8]">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save template</button>
    </Modal>}
    {issueOpen && <Modal title="Issue offer or contract" onClose={() => setIssueOpen(false)}><Field label="Candidate"><select value={applicationId} onChange={e => setApplicationId(e.target.value)} className="input"><option value="">Select candidate</option>{applications.map(a => <option key={a.id} value={a.id}>{a.firstName} {a.lastName} — {a.jobPost.title}</option>)}</select></Field><Field label="Template"><select value={templateId} onChange={e => { setTemplateId(e.target.value); setCustomValues({}) }} className="input"><option value="">Select template</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>{customVariables.length > 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Contract values</p><div className="grid gap-3 sm:grid-cols-2">{customVariables.map(variable => <Field key={variable} label={variable.replaceAll('_', ' ')}><input value={customValues[variable] ?? ''} onChange={event => setCustomValues(current => ({ ...current, [variable]: event.target.value }))} className="input bg-white" placeholder={`Value for {{${variable}}}`} /></Field>)}</div></div>}<Field label="Signing deadline (optional)"><input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="input" /></Field><p className="rounded-xl bg-[#eff6ff] p-3 text-xs leading-5 text-[#34516f]">Issuing creates a secure candidate link and copies it to your clipboard. You can also copy it from the issued-document list.</p><button disabled={saving || !chosen || !applicationId || customVariables.some(variable => !customValues[variable]?.trim())} onClick={issueDocument} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-black text-white transition hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Issue and copy signing link</button></Modal>}
  </main>
}

function Modal({ title, onClose, children, fullPage = false }: { title: string; onClose: () => void; children: React.ReactNode; fullPage?: boolean }) {
  return <div className={`fixed inset-0 z-50 flex items-center justify-center ${fullPage ? '' : 'p-4'}`}>
    <button className="absolute inset-0 bg-slate-950/35" onClick={onClose} />
    <div className={`relative w-full bg-white shadow-2xl ${fullPage ? 'flex h-full flex-col overflow-hidden' : 'max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl p-6'}`}>
      <div className={`flex shrink-0 items-center justify-between bg-white ${fullPage ? 'z-20 border-b border-slate-200 px-5 py-4 sm:px-8' : 'mb-5'}`}>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5 text-slate-400" /></button>
      </div>
      <div className={`space-y-4 ${fullPage ? 'min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6' : ''}`}>
        <div className={fullPage ? 'mx-auto max-w-6xl space-y-4' : 'space-y-4'}>{children}</div>
      </div>
    </div>
  </div>
}
function PaginatedEditor({ content, paperSize, contentRef, onChange }: { content: string; paperSize: PaperSize; contentRef: React.RefObject<HTMLDivElement | null>; onChange: (content: string) => void }) {
  const dimensions = paperDimensions[paperSize]
  const pages = content.startsWith(richTextMarker)
    ? content.slice(richTextMarker.length).split(pageBreakMarker)
    : paginateContent(content, paperSize).map(page => escapeHtml(page.text).replaceAll('\n', '<br>'))
  const editors = useRef<Array<HTMLDivElement | null>>([])
  const savedSelection = useRef<Range | null>(null)

  function savePages() { onChange(`${richTextMarker}${editors.current.slice(0, pages.length).map(editor => editor?.innerHTML ?? '').join(pageBreakMarker)}`) }
  function rememberSelection() { const selection = window.getSelection(); if (selection?.rangeCount && contentRef.current?.contains(selection.anchorNode)) savedSelection.current = selection.getRangeAt(0).cloneRange() }
  function command(name: string, value?: string) { contentRef.current?.focus(); if (savedSelection.current) { const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(savedSelection.current) } document.execCommand(name, false, value); rememberSelection(); savePages() }

  return <div><div className="mb-2 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-slate-700">Document content</p><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{pages.length} {pages.length === 1 ? 'page' : 'pages'} · {dimensions.label}</span></div>
    <div onMouseDownCapture={rememberSelection} className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-t-xl border border-slate-200 bg-white p-2 shadow-sm">
      <select aria-label="Font" defaultValue="Arial" onChange={event => command('fontName', event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>Montserrat</option><option>Courier New</option></select>
      <select aria-label="Font size" defaultValue="3" onChange={event => command('fontSize', event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"><option value="1">10</option><option value="2">12</option><option value="3">14</option><option value="4">18</option><option value="5">24</option><option value="6">32</option></select>
      <span className="mx-1 h-6 w-px bg-slate-200" />
      <ToolButton label="Bold" onClick={() => command('bold')}><Bold className="h-4 w-4" /></ToolButton><ToolButton label="Italic" onClick={() => command('italic')}><Italic className="h-4 w-4" /></ToolButton><ToolButton label="Underline" onClick={() => command('underline')}><Underline className="h-4 w-4" /></ToolButton>
      <span className="mx-1 h-6 w-px bg-slate-200" />
      <ToolButton label="Align left" onClick={() => command('justifyLeft')}><AlignLeft className="h-4 w-4" /></ToolButton><ToolButton label="Align center" onClick={() => command('justifyCenter')}><AlignCenter className="h-4 w-4" /></ToolButton><ToolButton label="Align right" onClick={() => command('justifyRight')}><AlignRight className="h-4 w-4" /></ToolButton><ToolButton label="Justify" onClick={() => command('justifyFull')}><AlignJustify className="h-4 w-4" /></ToolButton>
    </div>
    <div className="overflow-auto rounded-b-2xl bg-slate-200/70 p-4 sm:p-8"><div className="mx-auto flex w-max flex-col gap-6">{pages.map((page, index) => <div key={`${paperSize}-${index}`} className="relative shrink-0 bg-white shadow-xl" style={{ width: dimensions.width, minHeight: dimensions.minHeight }}><div ref={element => { editors.current[index] = element; if (index === 0 && element && !contentRef.current) contentRef.current = element }} contentEditable suppressContentEditableWarning onFocus={event => { contentRef.current = event.currentTarget }} onKeyUp={rememberSelection} onMouseUp={rememberSelection} onInput={() => { rememberSelection(); savePages() }} className="contract-rich-editor min-h-[inherit] w-full px-[9%] py-[8%] pb-16 font-serif text-[15px] leading-7 text-slate-800 outline-none" dangerouslySetInnerHTML={{ __html: page }} /><span className="pointer-events-none absolute bottom-5 left-0 right-0 text-center text-[11px] font-medium text-slate-400">Page {index + 1} of {pages.length}</span></div>)}</div></div>
  </div>
}
function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) { return <button type="button" title={label} aria-label={label} onMouseDown={event => event.preventDefault()} onClick={onClick} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-[#eff6ff] hover:text-[#1d4ed8]">{children}</button> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-bold text-slate-700">{label}<div className="mt-1.5">{children}</div></label> }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500"><FilePlus2 className="mx-auto mb-2 h-6 w-6 text-slate-300" />{text}</div> }
function Status({ value }: { value: string }) { const style = value === 'SIGNED' ? 'bg-emerald-50 text-emerald-700' : value === 'SENT' ? 'bg-[#eff6ff] text-[#1d4ed8]' : value === 'VOID' || value === 'DECLINED' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'; return <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${style}`}>{value}</span> }
