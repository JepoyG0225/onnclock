import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod'
import { accountingAccess } from '@/lib/accounting/access'
import { prepareSync,sendSync } from '@/lib/accounting/sync'
import { dateOnly } from '@/lib/expenses/policy'
import { logAudit } from '@/lib/audit'
const schema=z.object({provider:z.enum(['QUICKBOOKS','XERO']),sourceType:z.enum(['PAYROLL','CASH_ADVANCE','BUDGET','EXPENSE']),sourceId:z.string().min(1).max(100),action:z.enum(['PREVIEW','SEND']),previewHash:z.string().optional(),payment:z.object({date:dateOnly,method:z.enum(['BANK','CASH']),reference:z.string().trim().min(3).max(150)}).optional()})
export async function POST(req:NextRequest){
 const {ctx,error}=await accountingAccess(true);if(error)return error
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:422})
 const a=parsed.data
 try{
  if(a.action==='PREVIEW'){const p=await prepareSync(ctx.companyId,a.provider,a.sourceType,a.sourceId,a.payment);return NextResponse.json({document:p.document,previewHash:p.hash,tenantName:p.connection.tenantName,entity:p.request.entity,mapping:p.connection.accountMappings})}
  const result=await sendSync(ctx.companyId,a.provider,a.sourceType,a.sourceId,a.previewHash||'',a.payment)
  await logAudit(ctx,'CREATE','AccountingSyncRecord',a.sourceId,{description:`Sent ${a.sourceType} to ${a.provider}`,newValues:result}).catch(()=>{})
  return NextResponse.json(result)
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Sync failed.'},{status:422})}
}
