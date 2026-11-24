import { z } from 'zod'
export const PAGE_WIDTH = 595.28
export const REGION_HEIGHT = { header: 112, footer: 80 }
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid color')
export const elementSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(['text','companyName','address','tin','logo']),
  text: z.string().max(500).default(''),
  image: z.string().max(700000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/).optional(),
  x: z.number().min(0).max(PAGE_WIDTH), y: z.number().min(0).max(112),
  width: z.number().min(20).max(PAGE_WIDTH), height: z.number().min(10).max(112),
  fontSize: z.number().min(7).max(30), font: z.enum(['sans','serif','mono']),
  bold: z.boolean(), italic: z.boolean(), underline: z.boolean(),
  align: z.enum(['left','center','right']), color: hex,
})
export const designSchema = z.object({
  version: z.literal(1),
  hideDeductions: z.boolean().default(false),
  primary: hex, accent: hex, text: hex, muted: hex, deduction: hex,
  headerBackground: hex, footerBackground: hex,
  header: z.array(elementSchema).max(12), footer: z.array(elementSchema).max(12),
}).superRefine((d,ctx)=>{
  const ids=new Set<string>()
  for(const region of ['header','footer'] as const) for(const [index,e] of d[region].entries()) {
    if(ids.has(e.id)) ctx.addIssue({code:'custom',message:'Each element must have a unique ID',path:[region,index]})
    ids.add(e.id)
    if(e.x+e.width>PAGE_WIDTH+0.01 || e.y+e.height>REGION_HEIGHT[region]+0.01) ctx.addIssue({code:'custom',message:'Keep elements inside the header or footer',path:[region,index]})
    if(e.kind==='logo'&&!e.image) ctx.addIssue({code:'custom',message:'Upload a logo image',path:[region,index]})
  }
})
export type PayslipDesign = z.infer<typeof designSchema>
export type DesignElement = z.infer<typeof elementSchema>
export type DesignCompany = {name:string; address?:string|null; tin?:string|null; logoUrl?:string|null}
export function elementText(e:DesignElement,c:DesignCompany) {
  return e.kind==='companyName'?c.name:e.kind==='address'?(c.address??''):e.kind==='tin'?(c.tin?`TIN: ${c.tin}`:''):e.text
}
const base = {text:'',fontSize:9,font:'sans' as const,bold:false,italic:false,underline:false,align:'left' as const,color:'#ffffff'}
export const DEFAULT_DESIGN: PayslipDesign = {
 version:1,hideDeductions:false,primary:'#0b6ffb',accent:'#aadd30',text:'#1f2937',muted:'#64748b',deduction:'#e12747',headerBackground:'#0b6ffb',footerBackground:'#ffffff',
 header:[
  {...base,id:'title',kind:'text',text:'PAYSLIP',x:475,y:12,width:96,height:14,bold:true,align:'right'},
  {...base,id:'company',kind:'companyName',x:24,y:28,width:547,height:36,fontSize:14,bold:true},
  {...base,id:'address',kind:'address',x:24,y:70,width:547,height:24,fontSize:8},
  {...base,id:'tin',kind:'tin',x:24,y:96,width:547,height:12,fontSize:8},
 ],
 footer:[{...base,id:'footer',kind:'text',text:'This is a computer-generated payslip. No signature required. Please contact HR for any discrepancies.',x:24,y:10,width:547,height:40,fontSize:8,color:'#64748b'}],
}
export function readDesign(value:unknown):PayslipDesign|null {const p=designSchema.safeParse(value);return p.success?p.data:null}

export function contrastText(hex:string) {
 const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4))
 return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722>0.179?'#111827':'#ffffff'
}
