'use client'
import { useLayoutEffect, useRef, useState } from 'react'
import { paperSizes, readPaperSize } from '@/lib/hr-center/document-paper'
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Undo, Redo } from 'lucide-react'
import { documentBodyHtml, documentBodyCss, escapeDocumentText } from '@/lib/hr-center/document-body'
import { renderTemplate, templateVariables, phToday } from '@/lib/hr-center/policy'
import { DocumentBody } from './DocumentBody'
import { DocumentHeader, DocumentHeaderEditor } from './DocumentHeader'
const sample:Record<string,string>={employee_name:'Juan Dela Cruz',employee_number:'EMP-001',company_name:'Your Company',position:'HR Officer',department:'Human Resources',hire_date:'2024-01-15',employment_status:'REGULAR',date_issued:phToday(),purpose:'Employment verification',signatory:'Maria Santos, HR Manager'}
export function TemplateDesigner({data,onChange,onHeaderBusy,onFooterBusy}:{data:Record<string,unknown>;onChange:(patch:Record<string,unknown>)=>void;onHeaderBusy:(busy:boolean)=>void;onFooterBusy:(busy:boolean)=>void}) {
 const editor=useRef<HTMLDivElement>(null), selection=useRef<Range|null>(null), last=useRef<string|null>(null)
 const [tab,setTab]=useState('edit')
 const paperSize=readPaperSize(data.paperSize), paper=paperSizes[paperSize]
 const html=documentBodyHtml(data.body,data.bodyFormat)
 useLayoutEffect(()=>{if(editor.current&&last.current!==String(data.body??'')){editor.current.innerHTML=html;last.current=String(data.body??'')}},[html,data.body])
 function remember(){const s=window.getSelection();if(s?.rangeCount&&editor.current?.contains(s.anchorNode))selection.current=s.getRangeAt(0).cloneRange()}
 function publish(){const body=editor.current?.innerHTML??'';last.current=body;onChange({body,bodyFormat:'HTML'});remember()}
 function command(name:string,value?:string){editor.current?.focus();const s=window.getSelection();if(selection.current&&editor.current?.contains(selection.current.commonAncestorContainer)){s?.removeAllRanges();s?.addRange(selection.current)}document.execCommand('styleWithCSS',false,'true');document.execCommand(name,false,value);publish()}
 let preview=html,error='';try{preview=renderTemplate(html,Object.fromEntries(Object.entries(sample).map(([k,v])=>[k,escapeDocumentText(v)])))}catch(e){error=e instanceof Error?e.message:'Check template variables.'}
 const actions=[[Bold,'Bold','bold'],[Italic,'Italic','italic'],[Underline,'Underline','underline'],[AlignLeft,'Align left','justifyLeft'],[AlignCenter,'Center','justifyCenter'],[AlignRight,'Align right','justifyRight'],[List,'Bullet list','insertUnorderedList'],[ListOrdered,'Numbered list','insertOrderedList'],[Undo,'Undo','undo'],[Redo,'Redo','redo']] as const
 return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
  <style>{documentBodyCss}</style>
  <div className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3"><div><h3 className="font-semibold text-slate-900">Document designer</h3><p className="text-xs text-slate-500">Format your content and insert employee details.</p></div><div className="flex gap-1 lg:hidden">{['edit','preview'].map(t=><button data-app-tab data-active={tab===t} type="button" key={t} onClick={()=>setTab(t)} className={'rounded-lg px-3 py-2 text-sm '+(tab===t?'bg-blue-600 text-white':'bg-slate-100')}>{t==='edit'?'Edit':'Preview'}</button>)}</div></div>
  <div className="grid min-w-0 lg:grid-cols-2">
   <section className={(tab==='edit'?'block':'hidden')+' min-w-0 space-y-4 p-4 lg:block'}>
    <label className="block text-sm font-medium text-slate-700">Paper size<select value={paperSize} onChange={e=>onChange({paperSize:e.target.value})} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm">{Object.entries(paperSizes).map(([key,p])=><option key={key} value={key}>{p.label} ({p.dimensions})</option>)}</select></label>
    <div className="overflow-hidden rounded-xl border bg-white">
     <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap gap-1 border-b bg-slate-50 p-2">
      <select aria-label="Paragraph style" className="max-w-36 rounded border bg-white p-2 text-xs" defaultValue="" onChange={e=>{command('formatBlock',e.target.value);e.target.value=''}}><option value="" disabled>Paragraph style</option><option value="p">Normal text</option><option value="h1">Title</option><option value="h2">Heading</option><option value="h3">Subheading</option></select>
      <select aria-label="Font family" className="max-w-32 rounded border bg-white p-2 text-xs" defaultValue="" onChange={e=>{document.execCommand('styleWithCSS',false,'true');command('fontName',e.target.value);e.target.value=''}}><option value="" disabled>Font</option>{['Arial','Georgia','Verdana','Times New Roman'].map(f=><option key={f}>{f}</option>)}</select>
      {actions.map(([Icon,label,cmd])=><button type="button" key={cmd} title={label} aria-label={label} onMouseDown={e=>e.preventDefault()} onClick={()=>command(cmd)} className="rounded p-2 text-slate-600 hover:bg-blue-100 hover:text-blue-700"><Icon className="h-4 w-4"/></button>)}
     </div>
     <div ref={editor} contentEditable suppressContentEditableWarning role="textbox" aria-label="Template content" aria-multiline onInput={publish} onKeyUp={remember} onMouseUp={remember} onBlur={remember} onPaste={e=>{e.preventDefault();command('insertHTML',documentBodyHtml(e.clipboardData.getData('text/plain'),'PLAIN'))}} onDrop={e=>e.preventDefault()} className="hr-document-body min-h-80 p-5 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200"/>
    </div>
    <label className="block text-xs font-medium text-slate-600">Insert variable<select aria-label="Insert variable" className="mt-1 w-full rounded-lg border bg-white p-2 text-sm" value="" onChange={e=>command('insertText','{{'+e.target.value+'}}')}><option value="" disabled>Select employee or document detail</option>{templateVariables.map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
    <details className="rounded-xl border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Company header</summary><div className="mt-3"><DocumentHeaderEditor value={data.header} onChange={header=>onChange({header})} onBusy={onHeaderBusy}/></div></details>
    <details className="rounded-xl border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Company footer</summary><div className="mt-3"><DocumentHeaderEditor position="footer" value={data.footer} onChange={footer=>onChange({footer})} onBusy={onFooterBusy}/></div></details>
   </section>
   <section aria-label="Live document preview" className={(tab==='preview'?'block':'hidden')+' min-w-0 border-t bg-slate-100 p-4 lg:block lg:border-l lg:border-t-0'}>
    <div className="mb-3 flex items-center justify-between text-xs"><strong className="text-blue-700">LIVE PREVIEW</strong><span className="text-slate-500">Sample employee details</span></div>
    {error&&<p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
    <div style={{aspectRatio:`${paper.width} / ${paper.height}`}} className="rounded-sm border bg-white px-6 py-8 shadow-sm sm:px-8"><DocumentHeader value={data.header}/><DocumentBody body={preview} format="HTML"/><DocumentHeader position="footer" value={data.footer}/></div>
    <p className="mt-3 text-xs text-slate-500">{paper.label} ? {paper.dimensions}. Actual employee details are filled when issuing. Printed page breaks depend on document length.</p>
   </section>
  </div>
 </div>
}
