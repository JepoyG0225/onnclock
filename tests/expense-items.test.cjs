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






const policy=loader()('src/lib/expenses/policy.ts'),items=loader()('src/lib/expenses/items.ts')
const id='92c6807a-c6e6-4af2-9739-3269384fe450',other='92c6807a-c6e6-4af2-9739-3269384fe451'
const item={id,name:'Taxi',description:'Travel to client',amount:10.10}
const fields={category:'Transportation',description:'Client visit',expenseDate:'2026-11-09',items:[item,{...item,id:other,amount:20.20}]}
test('server derives precise totals and ignores a forged claim total',()=>{assert.equal(policy.claimFields.parse({...fields,amount:999}).amount,30.30)})
test('invalid, empty, duplicate and excessive item lists are rejected',()=>{
 for(const rows of [[],[item,item],[{...item,amount:-1}],[{...item,name:''}],[{...item,description:''}],[{...item,amount:1.001}],Array.from({length:51},()=>item)])assert.equal(policy.claimFields.safeParse({...fields,items:rows}).success,false)
})
test('receipt paths cannot be injected and editing preserves only this claim attachments',()=>{
 const parsed=policy.claimFields.parse({...fields,items:[{...item,receiptPath:'foreign/file'}]})
 assert.equal(parsed.items[0].receiptPath,undefined)
 const previous=[{...item,receiptPath:'tenant/claim/a.pdf',receiptFileName:'a.pdf'}]
 assert.equal(items.mergeExpenseItems([{...item,amount:40}],previous)[0].receiptPath,'tenant/claim/a.pdf')
 assert.equal(items.mergeExpenseItems([{...item,id:other}],previous)[0].receiptPath,undefined)
})
test('each line needs a receipt; legacy claim receipts are retained',()=>{
 assert.equal(items.hasExpenseReceipts({items:fields.items,receiptPath:'legacy.pdf'}),false)
 const rows=fields.items.map(row=>({...row,receiptPath:'tenant/claim/'+row.id+'.pdf'}))
 assert.equal(items.hasExpenseReceipts({items:rows}),true)
 assert.equal(items.hasExpenseReceipts({receiptUrl:'https://legacy.test/a.pdf'}),true)
 const publicClaim=items.publicExpense({items:rows,receiptPath:'private',receiptUrl:null})
 assert.equal(publicClaim.receiptPath,undefined);assert.equal(publicClaim.items[0].receiptPath,undefined);assert.equal(publicClaim.items[0].hasReceipt,true)
})
const ctx={companyId:'tenant',userId:'user',role:'EMPLOYEE',email:'test@example.test'}
const stamp=new Date('2026-11-09T01:00:00Z')
function receiptHarness({foreign=false,race=false,missing=false}={}){
 let record={id:'claim',companyId:'tenant',employeeId:'employee',status:'DRAFT',updatedAt:stamp,history:[],items:[{...item,receiptPath:foreign?'other/claim/old.pdf':'tenant/claim/old.pdf'}, {...item,id:other,receiptPath:'tenant/claim/second.pdf'}]}
 const calls={signed:[],removed:[],writes:[]}
 const db={expenseClaim:{findFirst:async q=>{assert.equal(q.where.companyId,'tenant');return missing?null:record},updateMany:async q=>{calls.writes.push(q);if(!race)record={...record,...q.data};return {count:race?0:1}},findUniqueOrThrow:async()=>record}}
 const storage={createSignedUrl:async path=>{calls.signed.push(path);return {data:{signedUrl:'https://storage.test/signed'}}},upload:async()=>({}),remove:async paths=>calls.removed.push(...paths)}
 const api=loader({'@/lib/prisma':{prisma:db},'@/lib/expenses/access':{expenseAccess:async()=>({ctx,employeeId:'employee',canReadAll:false})},'@/lib/expenses/storage':{RECEIPT_LIMIT:4*1024*1024,receiptMime:()=> 'application/pdf',receiptStorage:async()=>storage}})('src/app/api/expenses/[id]/receipt/route.ts')
 return {api,calls,get:()=>record}
}
test('receipt download checks company path and requested item',async()=>{
 const params={params:Promise.resolve({id:'claim'})}
 for(const settings of [{foreign:true},{missing:true}]){const h=receiptHarness(settings);assert.equal((await h.api.GET({nextUrl:new URL('https://app.test/receipt?itemId='+id)},params)).status,404);assert.equal(h.calls.signed.length,0)}
 const h=receiptHarness();assert.equal((await h.api.GET({nextUrl:new URL('https://app.test/receipt?itemId='+id)},params)).status,302)
 assert.equal(h.calls.signed[0],'tenant/claim/old.pdf')
})
test('upload replaces only the matching item, and concurrent change removes unused upload',async()=>{
 for(const race of [false,true]){
 const h=receiptHarness({race});const form=new FormData();form.set('itemId',id);form.set('file',new File(['%PDF-a test receipt'], 'new.pdf',{type:'application/pdf'}))
 const response=await h.api.POST({formData:async()=>form},{params:Promise.resolve({id:'claim'})})
 assert.equal(response.status,race?409:200);assert.equal(h.calls.writes[0].where.updatedAt,stamp)
 assert.equal(h.get().items[1].receiptPath,'tenant/claim/second.pdf')
 if(!race){assert.equal(h.calls.removed[0],'tenant/claim/old.pdf');const body=await response.json();assert.equal(body.claim.items[0].receiptPath,undefined)}else assert.notEqual(h.calls.removed[0],'tenant/claim/old.pdf')
 }
})

test('create persists the computed total and only validated item fields',async()=>{
 let saved
 const api=loader({'@/lib/expenses/access':{expenseAccess:async()=>({ctx,employeeId:'employee'})},'@/lib/prisma':{prisma:{company:{findUniqueOrThrow:async()=>({payrollCurrency:'PHP'})},expenseClaim:{create:async({data})=>{saved=data;return {...data,id:'claim'}}}}}})('src/app/api/expenses/route.ts')
 const response=await api.POST({json:async()=>({requestKey:id,fields:{...fields,amount:999,items:fields.items.map(item=>({...item,receiptPath:'forged'}))}})})
 assert.equal(response.status,201);assert.equal(saved.amount,30.30);assert.equal(saved.items[0].receiptPath,undefined)
})
test('submission rejects a missing item receipt even when a claim-level receipt exists',async()=>{
 let wrote=false
 const record={id:'claim',companyId:'tenant',employeeId:'employee',status:'DRAFT',updatedAt:stamp,amount:30.3,receiptPath:'tenant/claim/legacy.pdf',items:fields.items,employee:{userId:'user'}}
 const api=loader({'@/lib/expenses/access':{expenseAccess:async()=>({ctx,employeeId:'employee',canApprove:false})},'@/lib/prisma':{prisma:{expenseClaim:{findFirst:async()=>record},$transaction:async()=>{wrote=true}}},'@/lib/audit':{logAudit:async()=>{}},'@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>[]}})('src/app/api/expenses/[id]/route.ts')
 const response=await api.PATCH({json:async()=>({action:'SUBMIT',updatedAt:stamp.toISOString()})},{params:Promise.resolve({id:'claim'})})
 assert.equal(response.status,403);assert.equal(wrote,false)
})
