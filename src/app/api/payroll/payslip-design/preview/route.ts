import { NextRequest,NextResponse } from 'next/server'
import { PDFDocument,StandardFonts,rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fs from 'node:fs/promises'
import path from 'node:path'
import { requireAuth } from '@/lib/api-auth'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { designSchema, contrastText } from '@/lib/payslip-design/schema'
import { drawDesignRegion,pdfColor } from '@/lib/payslip-design/render'
export async function POST(req:NextRequest) {
 const {ctx,error}=await requireAuth();if(error)return error
 const perms=await getEffectivePermissions(ctx.role,ctx.companyId,ctx.userId)
 if(!perms.includes('payroll:read'))return NextResponse.json({error:'Access denied'},{status:403})
 const text=await req.text();if(text.length>2000000)return NextResponse.json({error:'Design is too large'},{status:413})
 let value:unknown;try{value=JSON.parse(text)}catch{return NextResponse.json({error:'Invalid design'},{status:422})}
 const parsed=designSchema.safeParse(value);if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:422})
 const company=await prisma.company.findUnique({where:{id:ctx.companyId},select:{name:true,address:true,tin:true}})
 if(!company)return NextResponse.json({error:'Company not found'},{status:404})
 try {
  const d=parsed.data,pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]);pdf.registerFontkit(fontkit)
  let regular,bold
  try {
   const dir=path.join(process.cwd(),'public/fonts/montserrat/static')
   regular=await pdf.embedFont(await fs.readFile(path.join(dir,'Montserrat-Regular.ttf')),{subset:true})
   bold=await pdf.embedFont(await fs.readFile(path.join(dir,'Montserrat-Bold.ttf')),{subset:true})
  } catch {regular=await pdf.embedFont(StandardFonts.Helvetica);bold=await pdf.embedFont(StandardFonts.HelveticaBold)}
  await drawDesignRegion(pdf,page,d,'header',company,regular,bold,true)
  await drawDesignRegion(pdf,page,d,'footer',company,regular,bold,true)
  const draw=(text:string,x:number,y:number,size=10,color=d.text,strong=false)=>page.drawText(text,{x,y,size,color:pdfColor(color),font:strong?bold:regular})
  draw('DESIGN PREVIEW - SAMPLE FIGURES ONLY',24,712,8,d.muted)
  page.drawRectangle({x:24,y:610,width:547,height:80,color:rgb(.97,.98,1)})
  page.drawRectangle({x:24,y:610,width:4,height:80,color:pdfColor(d.accent)})
  draw('SAMPLE EMPLOYEE',36,665,12,d.primary,true);draw('Employee No.: SAMPLE-001',36,645,9);draw('Department: Finance',36,629,9)
  draw('EARNINGS',32,580,10,d.primary,true);if (!d.hideDeductions) draw('DEDUCTIONS',318,580,10,d.deduction,true)
  draw('Basic pay',32,550);draw('PHP 25,000.00',d.hideDeductions ? 563-bold.widthOfTextAtSize('PHP 25,000.00',9) : 191,550,9,d.text,true)
  if (!d.hideDeductions) {
  draw('SSS',318,550);draw('PHP 1,000.00',482,550,9,d.deduction,true)
  draw('PhilHealth',318,523);draw('PHP 625.00',490,523,9,d.deduction,true)
  draw('Pag-IBIG',318,496);draw('PHP 100.00',490,496,9,d.deduction,true)
  draw('Withholding tax',318,469);draw('PHP 275.00',490,469,9,d.deduction,true)
  }
  draw('GROSS PAY',32,408,10,d.primary,true);draw('PHP 25,000.00',d.hideDeductions ? 563-bold.widthOfTextAtSize('PHP 25,000.00',9) : 188,408,9,d.primary,true)
  if (!d.hideDeductions) { draw('TOTAL DEDUCTIONS',318,408,9,d.deduction,true);draw('PHP 2,000.00',480,408,9,d.deduction,true) }
  page.drawRectangle({x:24,y:330,width:547,height:55,color:pdfColor(d.primary)})
  draw('NET PAY',36,352,12,contrastText(d.primary),true);draw('PHP 23,000.00',390,350,18,contrastText(d.primary),true)
  draw('Sample layout. Downloaded payslips use actual employee and payroll data.',24,300,8,d.muted)
  return new Response(new Uint8Array(await pdf.save()),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="Payslip-design-preview.pdf"'}})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to render design. Check your logo images.'},{status:422})}
}
