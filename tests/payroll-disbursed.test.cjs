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








function setup(status='LOCKED', allowed=true, found=true) {
 let writes=0,audits=0
 const run={id:'r',companyId:'c',status,computationStartedAt:null}
 const tx={$executeRaw:async()=>0,payrollRun:{findFirst:async({where})=>{assert.deepEqual(where,{id:'r',companyId:'c'});return found?run:null},updateMany:async({where,data})=>{assert.equal(where.companyId,'c');assert.equal(where.status,'LOCKED');assert.equal(data.disbursedBy,'u');assert.ok(data.disbursedAt instanceof Date);writes++;Object.assign(run,data);return {count:1}}}}
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{userId:'u',companyId:'c'},error:null})},'@/lib/auth/effective-permissions':{ctxHasPermission:async(_,permission)=>{assert.equal(permission,'payroll:lock');return allowed}},'@/lib/prisma':{prisma:{$transaction:async f=>f(tx)}},'@/lib/audit':{logAudit:async()=>{audits++}}})('src/app/api/payroll/[runId]/disburse/route.ts')
 return {call:()=>api.POST(new Request('http://localhost/api/payroll/r/disburse',{method:'POST'}),{params:Promise.resolve({runId:'r'})}),counts:()=>({writes,audits}),run}
}
test('locked payroll can be marked disbursed once with actor and timestamp',async()=>{const s=setup();assert.equal((await s.call()).status,200);assert.equal(s.run.status,'DISBURSED');assert.equal((await s.call()).status,200);assert.deepEqual(s.counts(),{writes:1,audits:1})})
test('read-only users cannot mark a payroll disbursed',async()=>{const s=setup('LOCKED',false);assert.equal((await s.call()).status,403);assert.equal(s.counts().writes,0)})
test('cross-company or missing payroll is not exposed',async()=>{const s=setup('LOCKED',true,false);assert.equal((await s.call()).status,404);assert.equal(s.counts().writes,0)})
test('draft, computed, pending, approved and cancelled payroll cannot be marked paid',async()=>{for(const status of ['DRAFT','COMPUTED','FOR_APPROVAL','APPROVED','CANCELLED']){const s=setup(status);assert.equal((await s.call()).status,409);assert.equal(s.counts().writes,0)}})
test('running computations block payment confirmation',async()=>{const s=setup();s.run.computationStartedAt=new Date();assert.equal((await s.call()).status,409)})
test('legacy wallet endpoints are retired without accessing payment providers',async()=>{for(const file of ['src/app/api/disbursement/[runId]/route.ts','src/app/api/disbursement/wallet/funding/route.ts','src/app/api/admin/disbursement-topups/[id]/approve/route.ts']){const api=loader()(file);assert.equal((await api.POST()).status,410)}})
test('mutation permission for payment confirmation is payroll lock',()=>{const {mutationPermissions}=loader()('src/lib/auth/mutation-permissions.ts');assert.deepEqual(mutationPermissions('/api/payroll/r/disburse','POST'),['payroll:lock'])})
test('disbursed payroll cannot be unlocked or deleted',async()=>{
 const tx={$executeRaw:async()=>0,payrollRun:{findFirst:async()=>({id:'r',status:'DISBURSED'})}}
 const overrides={'@/lib/api-auth':{requireAuth:async()=>({ctx:{userId:'u',companyId:'c'},error:null})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>true},'@/lib/prisma':{prisma:{...tx,$transaction:async f=>f(tx)}},'@/lib/audit':{logAudit:async()=>{}}}
 for(const [file,method,status] of [['src/app/api/payroll/[runId]/unlock/route.ts','POST',400],['src/app/api/payroll/[runId]/route.ts','DELETE',403]]){const api=loader(overrides)(file);assert.equal((await api[method](new Request('http://localhost'),{params:Promise.resolve({runId:'r'})})).status,status)}
})
test('employee payslips still include disbursed payroll',async()=>{
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{userId:'u',companyId:'c'},error:null})},'@/lib/prisma':{prisma:{employee:{findFirst:async()=>({id:'e'})},payslip:{findMany:async({where})=>{assert.equal(where.employeeId,'e');assert.ok(where.payrollRun.status.in.includes('DISBURSED'));return [{id:'p'}]}},employeeOtherDeduction:{findMany:async()=>[]}}}})('src/app/api/payroll/my-payslips/route.ts');const r=await api.GET();assert.equal(r.status,200);assert.equal((await r.json()).payslips.length,1)
})
