// Read-only by default. --apply appends corrections; original entries remain intact.
const {PrismaClient}=require('@prisma/client')
const fs=require('node:fs'),ts=require('typescript')
const mod={exports:{}}
new Function('module','exports',ts.transpileModule(fs.readFileSync('src/lib/billing/credit-policy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports)
const {invoiceSeatCredit}=mod.exports
const url=new URL(process.env.DATABASE_URL);url.searchParams.set('pgbouncer','true')
const p=new PrismaClient({datasources:{db:{url:url.toString()}}})
const targets=[{companyId:'cmnbg5ase0002sx0z3wn9owin',kind:'invoice-price'},{companyId:'cmoqidw130002wqrycpiwehxx',kind:'duplicate'}]
const marker='billing-credit-audit-2026-10-23-v1'
async function run(tx,target,apply) {
 if(apply)await tx.$queryRaw`SELECT id FROM subscriptions WHERE "companyId" = ${target.companyId} FOR UPDATE`
 const sub=await tx.subscription.findUnique({where:{companyId:target.companyId},include:{company:{select:{name:true}}}})
 const all=await tx.billingCreditEntry.findMany({where:{companyId:target.companyId},orderBy:[{createdAt:'asc'},{id:'asc'}]})
 if(all.some(e=>e.reason==='CREDIT_RECONCILIATION'&&e.notes?.includes(marker)))return {company:sub.company.name,status:'already reconciled'}
 const entries=all.filter(e=>e.reason==='EMPLOYEE_DEACTIVATION')
 const invoices=await tx.invoice.findMany({where:{companyId:target.companyId,status:'PAID'},orderBy:{paidAt:'desc'}})
 let difference=0;const adjustments=[];const seen=new Set()
 for(const entry of entries){
  let corrected=Number(entry.amount)
  const invoice=invoices.find(i=>i.periodStart<=entry.createdAt&&i.periodEnd>entry.createdAt&&i.paidAt&&i.paidAt<=entry.createdAt&&i.seatCount>0)
  if(!invoice)throw new Error('Missing verifiable invoice for '+entry.id)
  if(target.kind==='invoice-price')corrected=invoiceSeatCredit(invoice,entry.createdAt)
  else {const key=entry.sourceEmployeeId+':'+invoice.periodEnd.toISOString();if(seen.has(key))corrected=0;seen.add(key)}
  const delta=Number((corrected-Number(entry.amount)).toFixed(2))
  if(delta){difference+=delta;adjustments.push({entryId:entry.id,invoiceId:invoice.id,original:Number(entry.amount),corrected,delta})}
 }
 difference=Number(difference.toFixed(2))
 const ledger=Number(all.reduce((sum,e)=>sum+Number(e.amount),0).toFixed(2))
 if(ledger!==Number(sub.creditBalance))throw new Error('Cached balance mismatch; requires separate reconciliation')
 const after=Number((ledger+difference).toFixed(2));if(after<0)throw new Error('Correction would make credit negative')
 if(apply&&difference){await tx.billingCreditEntry.create({data:{companyId:target.companyId,amount:difference,reason:'CREDIT_RECONCILIATION',notes:JSON.stringify({marker,reason:target.kind,adjustments,legacySeatsUnchanged:true})}});await tx.subscription.update({where:{companyId:target.companyId},data:{creditBalance:after}})}
 return {company:sub.company.name,before:ledger,adjustment:difference,after,adjustments,applied:apply}
}
;(async()=>{const apply=process.argv.includes('--apply');for(const target of targets)console.log(JSON.stringify(apply?await p.$transaction(tx=>run(tx,target,true),{timeout:30000}):await run(p,target,false)))})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>p.$disconnect())
