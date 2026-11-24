import { documentPageCss, paperSizes, readPaperSize } from '@/lib/hr-center/document-paper'
import { documentBodyHtml, documentBodyCss } from '@/lib/hr-center/document-body'
import { documentHeaderHtml } from '@/lib/hr-center/document-header'
import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess } from '@/lib/hr-center/access'
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const a=await hrAccess();if(a.error)return a.error
 const {id}=await params,r=await prisma.hrOperation.findFirst({where:{id,companyId:a.ctx.companyId,kind:'DOCUMENT',...(!a.kinds.includes('DOCUMENT')?{employeeId:a.employeeId??'__none__'}:{})}})
 if(!r)return NextResponse.json({error:'Document not found.'},{status:404})
 const data=r.data as Record<string,unknown>
 const paper=paperSizes[readPaperSize(data.paperSize)]
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(r.title)}</title><style>${documentBodyCss}body{font:16px/1.7 Georgia,serif;margin:0;background:#f1f5f9;color:#172033}main{box-sizing:border-box;max-width:${paper.width}mm;margin:30px auto;padding:18mm;background:white}footer{margin-top:45px;font:12px sans-serif;color:#475569}.void{color:#b91c1c;font-weight:bold}button{padding:12px 20px;background:#1769ed;color:white;border:0;border-radius:8px;cursor:pointer}@media print{body{background:white}main{margin:0;padding:0;max-width:none}button{display:none}${documentPageCss(data.paperSize)}}</style></head><body><main><button onclick="window.print()">Print / Save as PDF</button>${r.status==='VOID'?'<p class="void">VOID DOCUMENT</p>':''}${documentHeaderHtml(data.header)}<article class="hr-document-body">${documentBodyHtml(data.body,data.bodyFormat)}</article>${documentHeaderHtml(data.footer,'footer')}<footer>Document reference: ${escape(r.id)}<br>Issued: ${escape(r.createdAt.toISOString())}<br>${r.acknowledgedAt?'Receipt acknowledged by employee on '+escape(r.acknowledgedAt.toISOString()):'Receipt acknowledgment pending'}</footer></main></body></html>`
 return new NextResponse(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",'X-Content-Type-Options':'nosniff'}})
}
