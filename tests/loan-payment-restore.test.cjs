const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
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





const frequency = loader()('src/lib/payroll/cutoff-frequency.ts').employeePeriodDivisor
const { loanInstallment } = loader()('src/lib/payroll/loan-repayment.ts')
test('monthly amortization follows employee frequency and caps the last payment', () => {
  assert.equal(loanInstallment(5200, frequency('MONTHLY'), 20000), 5200)
  assert.equal(loanInstallment(5200, frequency('SEMI_MONTHLY'), 20000), 2600)
  assert.equal(loanInstallment(5200, frequency('WEEKLY'), 20000), 1200)
  assert.equal(loanInstallment(2200, frequency('DAILY'), 20000), 100)
  assert.equal(loanInstallment(5200, frequency('WEEKLY'), 123.45), 123.45)
})
function fixture(permission=true) {
  let row={id:'l', companyId:'c', status:'ACTIVE', balance:735.25, manualPaidBalance:null, updatedAt:new Date()}
  const audits=[]
  const db={employeeLoan:{findFirst:async ({where})=>where.companyId===row.companyId?{...row}:null,updateMany:async({data})=>{row={...row,...data};return{count:1}}},auditLog:{create:async({data})=>audits.push(data)}}
  db.$transaction=async cb=>cb(db)
  const { PATCH }=loader({'@/lib/prisma':{prisma:db},'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c',userId:'u'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>permission}})('src/app/api/loans/[id]/route.ts')
  return {send:body=>PATCH({json:async()=>body},{params:Promise.resolve({id:'l'})}),row:()=>row,audits}
}
test('manual paid then revert restores exact last balance, not principal',async()=>{
 const f=fixture()
 assert.equal((await f.send({status:'FULLY_PAID',confirmed:true,expectedBalance:735.25})).status,200)
 assert.equal(f.row().balance,0);assert.equal(f.row().manualPaidBalance,735.25)
 assert.equal((await f.send({action:'REVERT_PAID',confirmed:true,expectedBalance:735.25})).status,200)
 assert.equal(f.row().balance,735.25);assert.equal(f.row().status,'ACTIVE');assert.equal(f.row().manualPaidBalance,null)
 assert.equal(f.audits.length,2)
 assert.equal((await f.send({action:'REVERT_PAID',confirmed:true,expectedBalance:735.25})).status,409)
})
test('confirmation, current balance and write permission are required',async()=>{
 const f=fixture()
 assert.equal((await f.send({status:'FULLY_PAID'})).status,409)
 assert.equal((await f.send({status:'FULLY_PAID',confirmed:true,expectedBalance:1000})).status,409)
 assert.equal(f.row().balance,735.25)
 assert.equal((await fixture(false).send({status:'FULLY_PAID',confirmed:true,expectedBalance:735.25})).status,403)
})
