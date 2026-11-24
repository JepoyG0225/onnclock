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

const {thirteenthDeadline,thirteenthTaxSplit}=loader()('src/lib/payroll/thirteenth-run.ts')
test('deadline follows Philippine calendar days including Dec 24 and overdue',()=>{assert.equal(thirteenthDeadline(2026,new Date('2026-11-21T03:00:00Z')).days,33);assert.equal(thirteenthDeadline(2026,new Date('2026-12-23T16:00:00Z')).label,'Due today');assert.equal(thirteenthDeadline(2026,new Date('2026-12-24T15:59:59Z')).days,0);assert.equal(thirteenthDeadline(2026,new Date('2026-12-24T16:00:00Z')).label,'1 day overdue');assert.ok(thirteenthDeadline(2025,new Date('2026-11-21')).days<0)})
test('tax review uses remaining shared exemption without treating taxable amount as tax',()=>{assert.deepEqual(thirteenthTaxSplit(50000,60000),{exempt:30000,taxable:20000});assert.deepEqual(thirteenthTaxSplit(100000,0),{exempt:90000,taxable:10000});assert.deepEqual(thirteenthTaxSplit(10000,100000),{exempt:0,taxable:10000})})
function fixture({write=true,paid=false,linked=null}={}){
 const logs=[{id:'log',employeeId:'employee',companyId:'company',year:2026,thirteenthAmount:100000,totalBasicPaid:1200000,updatedAt:new Date('2026-11-21T00:00:00Z'),isPaid:paid,payrollRunId:linked,employee:{isExemptFromTax:false}}],slips=[],runs=[];let lock=false
 const tx={$executeRaw:async()=>{lock=true},company:{findUniqueOrThrow:async({where})=>{assert.equal(where.id,'company');return {payrollCurrency:'PHP',thirteenthPayStartMonth:1,thirteenthPayStartDay:1,thirteenthPayEndMonth:12,thirteenthPayEndDay:31}}},thirteenthMonthLog:{findMany:async({where})=>{assert.equal(where.companyId,'company');assert.equal(where.year,2026);return logs},updateMany:async({where,data})=>{assert.equal(where.companyId,'company');for(const l of logs)if(where.id.in.includes(l.id))Object.assign(l,data);return {count:logs.length}}},payrollRun:{create:async({data})=>{assert.ok(lock);const r={id:'run',...data};runs.push(r);return r}},payslip:{groupBy:async()=>[],createMany:async({data})=>{slips.push(...data);return {count:data.length}}}}
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company',userId:'admin',role:'COMPANY_ADMIN'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>write},'@/lib/prisma':{prisma:{$transaction:async f=>f(tx)}},'@/lib/audit':{logAudit:async()=>{}}})('src/app/api/thirteenth-month/payroll/route.ts')
 const body={year:2026,payDate:'2026-12-24',reviewed:true,entries:[{id:'log',updatedAt:logs[0].updatedAt.toISOString(),amount:100000,priorBenefits:20000,withholdingTax:5000}]}
 return {logs,runs,slips,body,post:payload=>api.POST({json:async()=>payload??body})}
}
test('generation snapshots earnings and reviewed tax, no wages or contributions; repeat opens same run',async()=>{const f=fixture();let r=await f.post();assert.equal(r.status,201);assert.equal(f.runs.length,1);assert.equal(f.runs[0].runType,'THIRTEENTH_MONTH');assert.equal(f.slips[0].basicSalary,0);assert.equal(f.slips[0].otherEarnings,100000);assert.equal(f.slips[0].netPay,95000);assert.equal(f.slips[0].nonTaxableIncome,70000);assert.equal(f.slips[0].taxableIncome,30000);assert.equal(f.logs[0].isPaid,false);r=await f.post();assert.equal(r.status,200);assert.equal((await r.json()).existing,true);assert.equal(f.runs.length,1)})
test('read-only cannot generate, paid records cannot be regenerated',async()=>{assert.equal((await fixture({write:false}).post()).status,403);const f=fixture({paid:true});assert.equal((await f.post()).status,409);assert.equal(f.runs.length,0)})
test('stale source or foreign log ID cannot create payroll',async()=>{for(const patch of [{id:'foreign'},{updatedAt:'2026-11-20T00:00:00.000Z'},{amount:99999}]){const f=fixture();f.body.entries[0]={...f.body.entries[0],...patch};assert.equal((await f.post()).status,409);assert.equal(f.runs.length,0)}})
test('tax review acknowledgement, invalid dates, tax above payout and missing employees are rejected',async()=>{const f=fixture();assert.equal((await f.post({...f.body,reviewed:false})).status,422);assert.equal((await f.post({...f.body,payDate:'2026-02-30'})).status,422);f.body.entries[0].withholdingTax=100001;assert.equal((await f.post()).status,409);assert.equal(f.runs.length,0)})
test('disbursement marks linked 13th-month entries paid only after locking',async()=>{
 let paid=false,status='LOCKED';const run={id:'run',companyId:'company',runType:'THIRTEENTH_MONTH',get status(){return status},computationStartedAt:null}
 const tx={$executeRaw:async()=>{},payrollRun:{findFirst:async()=>run,updateMany:async({data})=>{status=data.status;return {count:1}}},payslip:{findMany:async()=>[{employeeId:'employee',grossPay:1000,netPay:1000,totalDeductions:0,withholdingTax:0}]},thirteenthMonthLog:{findMany:async()=>[{employeeId:'employee',thirteenthAmount:1000}],updateMany:async({where,data})=>{assert.equal(where.companyId,'company');assert.equal(where.payrollRunId,'run');assert.equal(status,'DISBURSED');paid=data.isPaid;return {count:1}}}}
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company',userId:'admin'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>true},'@/lib/payroll/anomalies':{auditPayrollRun:async()=>[]},'@/lib/prisma':{prisma:{...tx,$transaction:async f=>f(tx)}},'@/lib/audit':{logAudit:async()=>{}}})('src/app/api/payroll/[runId]/disburse/route.ts')
 assert.equal((await api.POST({}, {params:Promise.resolve({runId:'run'})})).status,200);assert.equal(paid,true)
})

test('annual computation counts cross-month cutoffs by ending month and excludes 13th-month runs',async()=>{
 let saved,queries=[];const tx={$executeRaw:async()=>{},thirteenthMonthLog:{count:async()=>0,upsert:async({create})=>{saved=create}}}
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>true},'@/lib/prisma':{prisma:{thirteenthMonthLog:{findMany:async()=>[]},company:{findUnique:async()=>({thirteenthPayStartMonth:1,thirteenthPayStartDay:1,thirteenthPayEndMonth:12,thirteenthPayEndDay:31})},employee:{findMany:async()=>[{id:'employee'}]},payslip:{findMany:async({where})=>{queries.push(where);assert.equal(where.payrollRun.runType,'REGULAR');assert.equal(where.payrollRun.periodStart,undefined);return where.payrollRun.periodEnd.gte.getUTCMonth()===9?[{basicSalary:13000,absenceDeduction:1000,lateDeduction:0,undertimeDeduction:0,calculationBasis:{monthlyPay:{version:1}}}]:[]}},$transaction:async f=>f(tx)}}})('src/app/api/thirteenth-month/compute/route.ts')
 const r=await api.POST({json:async()=>({year:2026})});assert.equal(r.status,200);assert.equal(queries.length,12);assert.equal(saved.octBasic,12000);assert.equal(saved.thirteenthAmount,1000)
})
test('generated unpaid source logs block recomputation before any payroll amounts change',async()=>{
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>true},'@/lib/prisma':{prisma:{thirteenthMonthLog:{findMany:async()=>[{payrollRunId:'run',isPaid:false}]}}}})('src/app/api/thirteenth-month/compute/route.ts');assert.equal((await api.POST({json:async()=>({year:2026})})).status,409)
})
