const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
function loader(overrides = {}) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (!fs.existsSync(file)) file = ['.ts','.tsx'].map(ext=>file+ext).find(p=>fs.existsSync(p))
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const source = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true} }).outputText
    const localRequire = name => Object.hasOwn(overrides,name) ? overrides[name] : name.startsWith('@/') ? load(path.join('src',name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file),name)) : require(name)
    new Function('require','module','exports',source)(localRequire,module,module.exports)
    return module.exports
  }
  return load
}


const {invoiceSeatCredit}=loader()('src/lib/billing/credit-policy.ts')
const invoice={id:'invoice',status:'PAID',seatCount:4,total:38.4,periodStart:new Date('2026-01-01'),periodEnd:new Date('2027-01-01'),paidAt:new Date('2026-01-01'),notes:null}
test('refund uses actual paid value and remaining invoice period, never subscription list price',()=>{
 assert.equal(invoiceSeatCredit(invoice,new Date('2026-01-01')),9.6)
 assert.equal(invoiceSeatCredit(invoice,new Date('2027-01-01')),0)
 assert.equal(invoiceSeatCredit({...invoice,seatCount:0},new Date('2026-02-01')),0)
 assert.equal(invoiceSeatCredit({...invoice,status:'UNPAID'},new Date('2026-02-01')),0)
 assert.equal(invoiceSeatCredit({...invoice,notes:JSON.stringify({subscriptionActivationPayload:{skipPeriodReset:true}})},new Date('2026-02-01')),0)
})
function setup(overrides={}) {
 const calls=[];const now=Date.now()
 const paid={...invoice,invoiceNo:'INV1',periodStart:new Date(now-86400000),periodEnd:new Date(now+86400000),paidAt:new Date(now-86400000)}
 const tx={
  $queryRaw:async()=>{calls.push('lock')},
  subscription:{findUnique:async()=>({status:'ACTIVE',seatCount:4,currentPeriodStart:paid.periodStart,currentPeriodEnd:paid.periodEnd}),update:async args=>calls.push(args),updateMany:async args=>{calls.push(args);return {count:1}}},
  employee:{findFirst:async()=>({isActive:false}),count:async()=>3},
  billingCreditEntry:{findFirst:async()=>null,count:async()=>0,aggregate:async()=>({_sum:{amount:0}}),create:async args=>{calls.push(args);return {id:'credit'}}},
  invoice:{findMany:async()=>[paid],findFirst:async()=>paid},
 }
 for(const [model,fields] of Object.entries(overrides))Object.assign(tx[model],fields)
 const api=loader({'@/lib/prisma':{prisma:{$transaction:async callback=>callback(tx)}}})('src/lib/billing/credit.ts')
 return {calls,api,tx}
}
test('refund is serialized and reduces one unused seat with a source invoice',async()=>{
 const {api,calls}=setup();const result=await api.issueDeactivationCredit({companyId:'company',employeeId:'employee'})
 assert.equal(result.amount,4.8);assert.equal(calls[0],'lock')
 assert.ok(calls.some(c=>c.data?.seatCount?.decrement===1))
 assert.ok(calls.some(c=>c.data?.sourceInvoiceId==='invoice'))
})
test('duplicate employee refund and reused seat never create another credit',async()=>{
 for(const overrides of [{billingCreditEntry:{findFirst:async()=>({id:'old'})}},{employee:{count:async()=>4}},{employee:{findFirst:async()=>({isActive:true})}},{invoice:{findMany:async()=>[]}}]){
  const {api,calls}=setup(overrides);assert.equal((await api.issueDeactivationCredit({companyId:'company',employeeId:'employee'})).amount,0)
  assert.ok(!calls.some(c=>c.data))
 }
})
test('legacy credits cannot refund more than total verified invoice funding',async()=>{
 const {api}=setup({billingCreditEntry:{aggregate:async()=>({_sum:{amount:38.4}})}})
 assert.equal((await api.issueDeactivationCredit({companyId:'company',employeeId:'employee'})).amount,0)
})
test('spending is idempotent and insufficient funds never write a ledger debit',async()=>{
 const repeated=setup({billingCreditEntry:{findFirst:async()=>({id:'old'})}})
 await repeated.api.spendCreditOnInvoice({companyId:'company',invoiceId:'invoice',amount:10})
 assert.equal(repeated.calls.length,1)
 const insufficient=setup({subscription:{updateMany:async()=>({count:0})}})
 await assert.rejects(()=>insufficient.api.spendCreditOnInvoice({companyId:'company',invoiceId:'invoice',amount:10}),/Insufficient/)
 assert.ok(!insufficient.calls.some(c=>c.data?.reason==='APPLIED_TO_INVOICE'))
})

test('payment made partly with existing credit retains that funded seat value',()=>{
 assert.equal(invoiceSeatCredit({...invoice,total:18.4,notes:JSON.stringify({subscriptionActivationPayload:{creditApplied:20}})},new Date('2026-01-01')),9.6)
})

const {effectiveSubscriptionStatus}=loader()('src/lib/billing/subscription-status.ts')
test('ended paid periods show expired at the exact end instant, even with a stale Active status',()=>{
 const now=new Date('2026-10-23T00:00:00Z')
 assert.equal(effectiveSubscriptionStatus({status:'ACTIVE',currentPeriodEnd:now},now),'EXPIRED')
 assert.equal(effectiveSubscriptionStatus({status:'ACTIVE',currentPeriodEnd:'2026-09-15T14:23:38.349Z'},now),'EXPIRED')
 assert.equal(effectiveSubscriptionStatus({status:'ACTIVE',currentPeriodEnd:'2027-01-01'},now),'ACTIVE')
 assert.equal(effectiveSubscriptionStatus({status:'TRIAL',trialEndsAt:now},now),'EXPIRED')
 assert.equal(effectiveSubscriptionStatus({status:'CANCELLED',currentPeriodEnd:now},now),'CANCELLED')
 assert.equal(effectiveSubscriptionStatus({status:'PAST_DUE',currentPeriodEnd:'2027-01-01'},now),'PAST_DUE')
 assert.equal(effectiveSubscriptionStatus({status:'PAST_DUE',currentPeriodEnd:now},now),'EXPIRED')
 assert.equal(effectiveSubscriptionStatus({status:'ACTIVE',currentPeriodEnd:null},now),'ACTIVE')
})
