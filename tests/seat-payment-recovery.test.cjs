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





test('seat recovery verifies payment and applies seats and credit only once',async()=>{
 for(const mode of ['success','pending','wrong-amount','wrong-period']){
 let paid=false,seats=9,credits=0;
 const period=new Date('2027-01-30');
 const inv=()=>({id:'inv',companyId:'co',status:paid?'PAID':'VOID',total:566.6,periodEnd:period,invoiceNo:'INV',notes:JSON.stringify({paymentProvider:'PAYMONGO_QRPH',paymentIntentId:'pi_test',subscriptionActivationPayload:{addSeats:5,creditApplied:150.87}})});
 const db={invoice:{findFirst:async()=>inv(),update:async()=>{paid=true}},subscription:{findUnique:async()=>({currentPeriodEnd:mode==='wrong-period'?new Date('2028-01-01'):period}),update:async({data})=>{seats+=data.seatCount.increment}},$queryRaw:async()=>[]};db.$transaction=async fn=>fn(db);
 const api=loader({'@/lib/prisma':{prisma:db},'@/lib/payments/paymongo':{getPaymentIntentStatus:async()=>({status:mode==='pending'?'processing':'succeeded',amount:mode==='wrong-amount'?1:56660,currency:'PHP'})},'./credit':{spendCreditInTransaction:async()=>{credits++}}})('src/lib/billing/reconcile-seats.ts');
 if(mode.startsWith('wrong')){await assert.rejects(()=>api.reconcileSeatPayment('inv','co'));assert.equal(seats,9);assert.equal(paid,false)}
 else {await api.reconcileSeatPayment('inv','co');await api.reconcileSeatPayment('inv','co');assert.equal(seats,mode==='success'?14:9);assert.equal(credits,mode==='success'?1:0)}
 }
});
