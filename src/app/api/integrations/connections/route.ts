import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod'
import { accountingAccess } from '@/lib/accounting/access'
import { prisma } from '@/lib/prisma'
import { accountingOAuthConfig } from '@/lib/accounting/oauth'
import { decryptAccountingToken } from '@/lib/accounting/crypto'
import { mappingSchema } from '@/lib/accounting/policy'
import { listAccounts,validateMappings,connectionAccessToken } from '@/lib/accounting/client'
const patchSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('MAP'),provider:z.enum(['QUICKBOOKS','XERO']),accountMappings:mappingSchema}),
 z.object({action:z.literal('TENANT'),provider:z.literal('XERO'),tenantId:z.string().uuid()}),
])
export async function GET(){
 const {ctx,error}=await accountingAccess();if(error)return error
 const connections=await prisma.accountingConnection.findMany({where:{companyId:ctx.companyId},select:{id:true,provider:true,tenantId:true,tenantName:true,status:true,currency:true,environment:true,accountMappings:true,metadata:true,lastSyncAt:true,lastError:true}})
 const recentSyncs=await prisma.accountingSyncRecord.findMany({where:{companyId:ctx.companyId},select:{id:true,provider:true,sourceType:true,sourceId:true,externalId:true,status:true,error:true,attempts:true,syncedAt:true,updatedAt:true,payload:true},orderBy:{updatedAt:'desc'},take:50})
 const configured=Object.fromEntries((['QUICKBOOKS','XERO'] as const).map(p=>{const c=accountingOAuthConfig(p);return [p,Boolean(c.clientId&&c.clientSecret)]}))
 return NextResponse.json({connections,recentSyncs:recentSyncs.map(({payload,...record})=>({...record,reference:(payload as {reference?:string}|null)?.reference,payment:(payload as {document?:{payment?:unknown}}|null)?.document?.payment})),configured})
}
export async function PATCH(req:NextRequest){
 const {ctx,error}=await accountingAccess(true);if(error)return error
 const parsed=patchSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid connection settings.'},{status:422})
 const a=parsed.data,c=await prisma.accountingConnection.findUnique({where:{companyId_provider:{companyId:ctx.companyId,provider:a.provider}}})
 if(!c)return NextResponse.json({error:'Connect the provider first.'},{status:409})
 try{
  if(a.action==='MAP'){
   validateMappings(c.provider,a.accountMappings,await listAccounts(c.id),c.currency)
   await prisma.accountingConnection.update({where:{id:c.id},data:{accountMappings:a.accountMappings}})
  }else{
   if(c.status!=='SELECT_TENANT')throw new Error('Reconnect Xero to select an organisation.')
   const metadata=c.metadata as {tenants?:Array<{tenantId:string;tenantName:string}>;previousTenantId?:string}
   const tenant=metadata.tenants?.find(t=>t.tenantId===a.tenantId);if(!tenant)throw new Error('This organisation was not authorized.')
   if(metadata.previousTenantId&&metadata.previousTenantId!==tenant.tenantId&&await prisma.accountingSyncRecord.count({where:{connectionId:c.id}}))throw new Error('Select the original organisation to preserve sync history.')
   const {accessToken}=await connectionAccessToken(c.id)
   const current=await prisma.accountingConnection.findUniqueOrThrow({where:{id:c.id}})
   const response=await fetch('https://api.xero.com/api.xro/2.0/Organisation',{headers:{Authorization:`Bearer ${accessToken}`,'Xero-tenant-id':tenant.tenantId,Accept:'application/json'},signal:AbortSignal.timeout(15000)})
   const data=await response.json()
   const organisation=data.Organisations?.[0];if(!response.ok||!organisation?.BaseCurrency)throw new Error('Could not verify organisation currency.')
   const changed=await prisma.accountingConnection.updateMany({where:{id:c.id,status:'SELECT_TENANT',updatedAt:current.updatedAt},data:{tenantId:tenant.tenantId,tenantName:tenant.tenantName,currency:organisation.BaseCurrency,status:'CONNECTED',metadata:{},...(metadata.previousTenantId&&metadata.previousTenantId!==tenant.tenantId?{accountMappings:{}}:{})}})
   if(!changed.count)throw new Error('Connection changed. Refresh and select the organisation again.')
  }
  return NextResponse.json({success:true})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not update connection.'},{status:422})}
}
export async function DELETE(req:NextRequest){
 const {ctx,error}=await accountingAccess(true);if(error)return error
 const provider=req.nextUrl.searchParams.get('provider');if(!['QUICKBOOKS','XERO'].includes(provider||''))return NextResponse.json({error:'Unsupported provider.'},{status:422})
 const c=await prisma.accountingConnection.findUnique({where:{companyId_provider:{companyId:ctx.companyId,provider:provider!}}})
 if(c&&await prisma.accountingSyncRecord.count({where:{connectionId:c.id,status:'PROCESSING'}}))return NextResponse.json({error:'Wait for the current sync to finish before disconnecting.'},{status:409})
 let warning:string|undefined
 if(c&&c.status!=='DISCONNECTED'){
  try{
   if(c.provider==='QUICKBOOKS'){
    const config=accountingOAuthConfig('QUICKBOOKS')
    const response=await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({token:decryptAccountingToken(c.refreshTokenEncrypted)})})
    if(!response.ok)throw new Error('Revocation failed')
   }else{
    const {accessToken}=await connectionAccessToken(c.id)
    const headers={Authorization:`Bearer ${accessToken}`}
    const response=await fetch('https://api.xero.com/connections',{headers,signal:AbortSignal.timeout(15000)})
    const tenants=await response.json();if(!response.ok||!Array.isArray(tenants))throw new Error('Revocation failed')
    const tenant=tenants.find(t=>t.tenantId===c.tenantId)
    if(tenant){const revoked=await fetch(`https://api.xero.com/connections/${encodeURIComponent(tenant.id)}`,{method:'DELETE',headers,signal:AbortSignal.timeout(15000)});if(!revoked.ok)throw new Error('Revocation failed')}
   }
  }catch{warning='Disconnected in OnClock. Remove OnClock from the provider connected-app settings to complete access revocation.'}
 }
 await prisma.accountingConnection.updateMany({where:{companyId:ctx.companyId,provider:provider!},data:{status:'DISCONNECTED',accessTokenEncrypted:'',refreshTokenEncrypted:'',metadata:{}}})
 return NextResponse.json({disconnected:true,warning})
}
