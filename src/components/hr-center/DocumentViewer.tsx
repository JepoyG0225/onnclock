import { FileText } from 'lucide-react'
import { paperSizes, readPaperSize } from '@/lib/hr-center/document-paper'
import { DocumentHeader } from './DocumentHeader'
import { DocumentBody } from './DocumentBody'

export function DocumentViewer({data,template=false}:{data:Record<string,unknown>;template?:boolean}) {
 const paper=paperSizes[readPaperSize(data.paperSize)]
 return <section aria-label="Document preview" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/80">
   <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
     <span className="flex items-center gap-2 text-xs font-semibold text-primary"><FileText className="h-4 w-4 text-accent"/>{template?'Template preview':'Document preview'}</span>
     <span className="text-xs text-slate-500">{paper.label} <span className="hidden sm:inline">| {paper.dimensions}</span></span>
   </div>
   {template&&<p className="px-4 pt-3 text-xs leading-5 text-slate-500">Fields in double braces are filled with employee details when the document is issued.</p>}
   <div className="p-3 sm:p-6">
     <article aria-label="Document page" className="mx-auto flex w-full max-w-[760px] flex-col border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-12 sm:py-10 [&_.hr-document-body]:break-words [overflow-wrap:anywhere]" style={{minHeight:'400px',aspectRatio:`${paper.width} / ${paper.height}`}}>
       <DocumentHeader value={data.header}/>
       <div className="flex-1"><DocumentBody body={data.body} format={data.bodyFormat}/></div>
       <DocumentHeader position="footer" value={data.footer}/>
     </article>
   </div>
   {template&&typeof data.notes==='string'&&data.notes.trim()&&<aside className="mx-3 mb-3 rounded-xl border border-orange-100 bg-orange-50/60 p-4 sm:mx-6 sm:mb-6"><h3 className="text-xs font-semibold text-primary">Internal notes</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{data.notes}</p></aside>}
 </section>
}
