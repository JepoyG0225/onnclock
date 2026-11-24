import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { providerPayload,type AccountMapping } from './policy'
import { sourceDocument,type PaymentConfirmation } from './sources'
import { accountingRequest,AccountingApiError,listAccounts,validateMappings } from './client'
export async function prepareSync(companyId:string,provider:string,sourceType:string,sourceId:string,payment?:PaymentConfirmation){
 const connection=await prisma.accountingConnection.findUnique({where:{companyId_provider:{companyId,provider}}})
 if(!connection||connection.status!=='CONNECTED')throw new Error('Connect and select an accounting company first.')
 const document=await sourceDocument(companyId,sourceType,sourceId,payment)
 if(document.currency!==connection.currency)throw new Error(`Source currency ${document.currency} differs from ${connection.currency}. Currency conversion is not enabled.`)
 const mapping=connection.accountMappings as AccountMapping
 const reference='OC'+createHash('sha256').update(`${companyId}:${sourceType}:${sourceId}`).digest('hex').slice(0,18)
 const request=providerPayload(provider,document,mapping,reference)
 const snapshot={document,request,tenantId:connection.tenantId,environment:connection.environment,mapping,reference}
 const hash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
 return {connection,document,request,snapshot,hash}
}
export async function sendSync(companyId:string,provider:string,sourceType:string,sourceId:string,previewHash:string,payment?:PaymentConfirmation){
 const prepared=await prepareSync(companyId,provider,sourceType,sourceId,payment)
 if(prepared.hash!==previewHash)throw new Error('The source or mappings changed. Preview again before sending.')
 const {connection,request,snapshot,hash}=prepared
 validateMappings(provider,connection.accountMappings as AccountMapping,await listAccounts(connection.id),connection.currency)
 let record=await prisma.accountingSyncRecord.upsert({where:{provider_sourceType_sourceId:{provider,sourceType,sourceId}},create:{companyId,connectionId:connection.id,provider,sourceType,sourceId,status:'PENDING'},update:{}})
 if(record.companyId!==companyId||record.connectionId!==connection.id)throw new Error('This source belongs to a different connection.')
 if(record.status==='SYNCED')return {alreadySynced:true,externalId:record.externalId}
 if(record.status==='UNKNOWN'||record.status==='PROCESSING')throw new Error('This transaction requires reconciliation or is still processing. Check sync history before trying again.')
 const claimed=await prisma.accountingSyncRecord.updateMany({where:{id:record.id,status:{in:['PENDING','FAILED']}},data:{status:'PROCESSING',payloadHash:hash,payload:snapshot as unknown as Prisma.InputJsonValue,attempts:{increment:1},error:null}})
 if(!claimed.count)throw new Error('Another request is already syncing this source.')
 record=await prisma.accountingSyncRecord.findUniqueOrThrow({where:{id:record.id}})
 try{
  const key=createHash('sha256').update(`${record.id}:${hash}`).digest('hex').slice(0,40)
  const {data}=await accountingRequest(connection.id,request.path+(provider==='QUICKBOOKS'?`?requestid=${key}`:''),{method:'POST',headers:provider==='XERO'?{'Idempotency-Key':key}:{},body:JSON.stringify(request.body)})
  const entity=provider==='QUICKBOOKS'?data[request.entity]:data[request.entity]?.[0]
  if(entity?.HasValidationErrors)throw new AccountingApiError(entity.ValidationErrors?.[0]?.Message||'Provider rejected the transaction.',400)
  const externalId=entity?.[request.idField]
  if(!externalId)throw new Error('Provider response did not include a transaction ID. Check the provider before retrying.')
  await prisma.$transaction([
   prisma.accountingSyncRecord.update({where:{id:record.id},data:{status:'SYNCED',externalId:String(externalId),syncedAt:new Date(),error:null}}),
   prisma.accountingConnection.update({where:{id:connection.id},data:{lastSyncAt:new Date(),lastError:null}}),
  ])
  return {externalId:String(externalId)}
 }catch(e){
  const rejected=e instanceof AccountingApiError&&[400,401,403,404,422,429].includes(e.status)
  const message=e instanceof Error?e.message:'Accounting sync failed.'
  await prisma.accountingSyncRecord.updateMany({where:{id:record.id,status:'PROCESSING'},data:{status:rejected?'FAILED':'UNKNOWN',error:message.slice(0,2000)}})
  throw new Error(rejected?message:`Outcome uncertain: ${message} Check the accounting provider and reconcile this record.`)
 }
}
