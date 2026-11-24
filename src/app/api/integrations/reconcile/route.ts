import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { accountingAccess } from '@/lib/accounting/access'
import { accountingRequest } from '@/lib/accounting/client'
import { logAudit } from '@/lib/audit'
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('VERIFY'),id:z.string(),externalId:z.string().trim().min(1).max(100)}),z.object({action:z.literal('CONFIRM_NOT_CREATED'),id:z.string(),confirmed:z.literal(true),reason:z.string().trim().min(10).max(1000)})])
export async function POST(req:NextRequest){
 const {ctx,error}=await accountingAccess(true);if(error)return error
 const a=schema.safeParse(await req.json().catch(()=>null));if(!a.success)return NextResponse.json({error:'Enter the transaction ID from the accounting provider.'},{status:422})
 const record=await prisma.accountingSyncRecord.findFirst({where:{id:a.data.id,companyId:ctx.companyId}})
 if(!record||!['UNKNOWN','PROCESSING'].includes(record.status)||record.status==='PROCESSING'&&record.updatedAt.getTime()>Date.now()-120_000)return NextResponse.json({error:'This record is not ready for reconciliation.'},{status:409})
 if(a.data.action==='CONFIRM_NOT_CREATED'){
  const updated=await prisma.accountingSyncRecord.updateMany({where:{id:record.id,companyId:ctx.companyId,status:record.status,updatedAt:record.updatedAt},data:{status:'FAILED',error:`Provider checked by ${ctx.email}; no transaction found. ${a.data.reason}`}})
  if(!updated.count)return NextResponse.json({error:'Record changed. Refresh history.'},{status:409})
  await logAudit(ctx,'UPDATE','AccountingSyncRecord',record.id,{description:'Confirmed transaction not created in accounting provider',newValues:{reason:a.data.reason}})
  return NextResponse.json({success:true})
 }
 const payload=record.payload as {request:{path:string;entity:string;idField:string};reference:string;tenantId:string}
 try{
  const {connection,data}=await accountingRequest(record.connectionId,`${payload.request.path}/${encodeURIComponent(a.data.externalId)}`)
  if(connection.tenantId!==payload.tenantId)throw new Error('Accounting company changed.')
  const entity=record.provider==='QUICKBOOKS'?data[payload.request.entity]:data[payload.request.entity]?.[0]
  const reference=entity?.DocNumber||entity?.Reference||entity?.Narration||''
  if(entity?.[payload.request.idField]!==a.data.externalId||!(reference===payload.reference||reference.startsWith(payload.reference+' ')))throw new Error('That transaction does not match this OnClock reference.')
  const updated=await prisma.accountingSyncRecord.updateMany({where:{id:record.id,companyId:ctx.companyId,status:record.status,updatedAt:record.updatedAt},data:{status:'SYNCED',externalId:a.data.externalId,syncedAt:new Date(),error:null}})
  if(!updated.count)throw new Error('Record changed. Refresh sync history.')
  await logAudit(ctx,'UPDATE','AccountingSyncRecord',record.id,{description:'Reconciled with verified external transaction ID'}).catch(()=>{})
  return NextResponse.json({success:true})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Reconciliation failed.'},{status:422})}
}
