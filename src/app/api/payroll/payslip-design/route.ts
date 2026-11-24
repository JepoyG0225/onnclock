import { validateDesignLayout } from '@/lib/payslip-design/render'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { requireAuth } from '@/lib/api-auth'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { designSchema, DEFAULT_DESIGN, readDesign } from '@/lib/payslip-design/schema'
export async function GET() {
 const {ctx,error}=await requireAuth();if(error)return error
 const permissions=await getEffectivePermissions(ctx.role,ctx.companyId,ctx.userId)
 if(!permissions.includes('payroll:read'))return NextResponse.json({error:'Access denied'},{status:403})
 const company=await prisma.company.findUnique({where:{id:ctx.companyId},select:{name:true,address:true,tin:true,logoUrl:true,payslipDesign:true}})
 if(!company)return NextResponse.json({error:'Company not found'},{status:404})
 const {payslipDesign,...details}=company
 return NextResponse.json({design:readDesign(payslipDesign)??DEFAULT_DESIGN,company:details,canEdit:permissions.includes('payroll:write')},{headers:{'Cache-Control':'private, no-store'}})
}
export async function PUT(req:NextRequest) {
 const {ctx,error}=await requireAuth();if(error)return error
 const permissions=await getEffectivePermissions(ctx.role,ctx.companyId,ctx.userId)
 if(!permissions.includes('payroll:write'))return NextResponse.json({error:'View-only access. You cannot change the payslip design.'},{status:403})
 const body=await req.text();if(body.length>2000000)return NextResponse.json({error:'Design is too large. Use smaller logo images.'},{status:413})
 let input:unknown;try{input=JSON.parse(body)}catch{return NextResponse.json({error:'Invalid design'},{status:422})}
 const parsed=designSchema.safeParse(input);if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:422})
 try {
  for(const e of [...parsed.data.header,...parsed.data.footer]) if(e.kind==='logo'&&e.image) {
   const image=await sharp(Buffer.from(e.image.split(',')[1],'base64'),{limitInputPixels:16000000}).rotate().resize(1200,400,{fit:'inside',withoutEnlargement:true}).png().toBuffer()
   if(image.length>500000)return NextResponse.json({error:'Logo is too large. Upload a smaller image.'},{status:422})
   e.image=`data:image/png;base64,${image.toString('base64')}`
  }
 }catch{return NextResponse.json({error:'Use a valid PNG or JPEG logo image.'},{status:422})}
 const company=await prisma.company.findUnique({where:{id:ctx.companyId},select:{name:true,address:true,tin:true}})
 if(!company)return NextResponse.json({error:'Company not found'},{status:404})
 try {await validateDesignLayout(parsed.data,company)} catch(e) {return NextResponse.json({error:e instanceof Error?e.message:'Unable to render design'},{status:422})}
 await prisma.company.update({where:{id:ctx.companyId},data:{payslipDesign:parsed.data as Prisma.InputJsonValue}})
 return NextResponse.json({design:parsed.data})
}
