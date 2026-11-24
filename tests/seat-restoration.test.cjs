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


const {availableSeatRestoration,reserveEmployeeSeat,SeatLimitError}=loader()('src/lib/billing/restore-seat.ts')
function setup({balance=900,seats=32,active=32,expired=false,alreadyActive=false,restored=0}={}) {
 const now=Date.now(),start=new Date(now-86400000),end=new Date(now+(expired?-1000:90*86400000))
 const sub={status:'ACTIVE',seatCount:seats,creditBalance:balance,currentPeriodStart:start,currentPeriodEnd:end}
 const invoice={id:'invoice',invoiceNo:'INV',status:'PAID',seatCount:35,total:10500,periodStart:start,periodEnd:end,paidAt:start,notes:null}
 const entries=Array.from({length:3},()=>({reason:'EMPLOYEE_DEACTIVATION',sourceInvoiceId:'invoice',notes:JSON.stringify({seatRemoved:true})})).concat(Array.from({length:restored},()=>({reason:'SEAT_RESTORATION',sourceInvoiceId:'invoice'})))
 const calls=[]
 const db={$queryRaw:async()=>calls.push('lock'),subscription:{findUnique:async()=>sub,update:async args=>{calls.push(args);sub.seatCount+=args.data.seatCount.increment;sub.creditBalance-=args.data.creditBalance.decrement}},invoice:{findMany:async()=>[invoice]},billingCreditEntry:{findMany:async()=>entries,create:async args=>{calls.push(args);entries.push(args.data)}},employee:{count:async()=>active,findFirst:async()=>({isActive:alreadyActive})}}
 return {db,calls,sub}
}
test('restores one paid seat with a matching negative credit ledger entry',async()=>{
 const {db,calls,sub}=setup();await reserveEmployeeSeat(db,'company','employee')
 assert.equal(calls[0],'lock');assert.equal(sub.seatCount,33)
 const entry=calls.find(c=>c.data?.reason==='SEAT_RESTORATION').data
 assert.equal(entry.companyId,'company');assert.equal(entry.sourceEmployeeId,'employee');assert.equal(entry.sourceInvoiceId,'invoice');assert.ok(entry.amount<0)
 assert.equal(Number((900-sub.creditBalance).toFixed(2)),-entry.amount)
})
test('available seats and already active employees never spend credit',async()=>{
 for(const options of [{active:31},{alreadyActive:true}]){const {db,calls}=setup(options);await reserveEmployeeSeat(db,'company','employee');assert.equal(calls.length,1)}
})
test('insufficient credit, expiry, original paid maximum, already restored seats and over-cap accounts are blocked',async()=>{
 for(const options of [{balance:0},{expired:true},{seats:35,active:35},{restored:3},{active:33}]){
  const {db,calls}=setup(options);await assert.rejects(()=>reserveEmployeeSeat(db,'company'),SeatLimitError);assert.equal(calls.length,1)
 }
})
test('eligibility preview is read only and identifies the original paid maximum',async()=>{
 const {db,calls}=setup();const result=await availableSeatRestoration(db,'company');assert.equal(result.maximum,35);assert.ok(result.amount>0);assert.equal(calls.length,0)
})
