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




const ops=loader()('src/lib/payroll/operations.ts')
test('remittance totals include employee and employer shares plus EC, without mixing loans',()=>{
 const s={sssEmployee:500,sssEmployer:1000,sssEc:30,sssLoanDeduction:200,pagibigEmployee:200,pagibigEmployer:200,pagibigLoan:150,withholdingTax:300}
 assert.equal(ops.remittanceAmount(s,'SSS'),1530);assert.equal(ops.remittanceAmount(s,'SSS_LOANS'),200);assert.equal(ops.remittanceAmount(s,'PAGIBIG'),400);assert.equal(ops.remittanceAmount(s,'BIR'),300)
})
test('employer cost does not add employee deductions or allowances twice',()=>{
 assert.deepEqual(ops.payrollCost({grossPay:20000,otherEarnings:5000,sssEmployer:1000,sssEc:30,philhealthEmployer:500,pagibigEmployer:200,withholdingTax:1500}),{gross:20000,employer:1730,total:21730})
})
test('pay-date month boundaries handle leap years and reject invalid input',()=>{
 assert.equal(ops.monthBounds('2024-02').lt.toISOString(),'2024-03-01T00:00:00.000Z');assert.throws(()=>ops.monthBounds('2026-13'));assert.throws(()=>ops.monthBounds('2026-1'))
})
test('payslip question amount uses saved payroll values including custom income',()=>{
 const {payslipQuestionItems}=loader()('src/lib/hr-requests/payslip-items.ts');const rows=payslipQuestionItems({basicSalary:10000,lateDeduction:100,undertimeDeduction:50,otherEarnings:1500,incomes:[{typeName:'Commission',amount:1000}],otherDeductions:200},[{label:'Uniform',amount:200}]);assert.deepEqual(rows.find(([l])=>l==='Late / undertime'),['Late / undertime',150]);assert.deepEqual(rows.find(([l])=>l==='Other earnings'),['Other earnings',500]);assert.deepEqual(rows.find(([l])=>l==='Uniform'),['Uniform',200])
})
test('employee journey access cannot be redirected to another employee or tenant',async()=>{
 const calls=[];const db={employee:{findFirst:async()=>({id:'self'})},onboardingProcess:{findMany:async args=>{calls.push(args);return []}},offboardingProcess:{findMany:async args=>{calls.push(args);return []}},userCompany:{findMany:async()=>[]}}
 const route=loader({'@/lib/prisma':{prisma:db},'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'tenant',userId:'user'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>false},'@/lib/hris-pro':{requireHrisProApi:async()=>null}})('src/app/api/employee-journeys/route.ts')
 let res=await route.GET({nextUrl:new URL('https://example.test/api/employee-journeys?scope=mine&employeeId=someone-else')});assert.equal(res.status,200);for(const c of calls){assert.equal(c.where.companyId,'tenant');assert.equal(c.where.employeeId,'self')}
 res=await route.GET({nextUrl:new URL('https://example.test/api/employee-journeys')});assert.equal(res.status,403)
})
test('read-only payroll access cannot prepare a government remittance',async()=>{
 let touched=false;const route=loader({'@/lib/prisma':{prisma:{$transaction:async()=>{touched=true}}},'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'tenant',userId:'user'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async(_ctx,p)=>p==='payroll:read'},'@/lib/hr-center/service':{jsonData:v=>v}})('src/app/api/payroll/operations/route.ts');const res=await route.POST({json:async()=>({month:'2026-11',agency:'SSS',dueDate:'2026-12-10'})});assert.equal(res.status,403);assert.equal(touched,false)
})
test('expiry monitor creates one deterministic record per source expiry and closes obsolete alerts',async()=>{
 const created=new Set(),closed=[];const db={employeeDocument:{findMany:async()=>[{id:'doc',employeeId:'emp',employee:{companyId:'tenant'},documentType:'License',expiresAt:new Date('2026-12-01')}]},employeeCertification:{findMany:async()=>[]},hrOperation:{createMany:async({data})=>{const k=data[0].requestKey;if(created.has(k))return {count:0};created.add(k);assert.equal(data[0].companyId,'tenant');return {count:1}},findMany:async()=>[{id:'old',version:1,data:{sourceType:'DOCUMENT',sourceId:'removed',expiryDate:'2026-01-01'}}],updateMany:async args=>{closed.push(args);return {count:1}}}}
 const {syncExpiryRecords}=loader({'@/lib/prisma':{prisma:db},'./service':{jsonData:v=>v},'./policy':{phToday:()=> '2026-11-26'}})('src/lib/hr-center/expiry.ts');assert.equal(await syncExpiryRecords(),1);assert.equal(await syncExpiryRecords(),0);assert.equal(created.size,1);assert.equal(closed[0].data.status,'CANCELLED')
})
test('paid remittance and renewed expiry require payment / renewal evidence fields',()=>{
 const {validateState}=loader()('src/lib/hr-center/policy.ts');assert.ok(validateState('COMPLIANCE','PAID',{paidAmount:0},'2026-12-01'));assert.equal(validateState('COMPLIANCE','PAID',{reference:'PRN-1',submittedDate:'2026-11-26',paidAmount:1000},'2026-12-01'),null);assert.ok(validateState('EXPIRY','RENEWED',{},'2026-12-01'))
})

test('payslip questions cannot reference another employee or company payslip',async()=>{
 let creates=0;const db={payslip:{findFirst:async({where})=>{assert.equal(where.employeeId,'self');assert.equal(where.payrollRun.companyId,'tenant');assert.deepEqual(where.payrollRun.status.in,['APPROVED','LOCKED','DISBURSED']);return null}},hrRequest:{create:async()=>{creates++}}}
 const route=loader({'@/lib/prisma':{prisma:db},'@/lib/hr-requests/access':{hrRequestAccess:async()=>({ctx:{companyId:'tenant',userId:'user'},employeeId:'self'}),hrRequestAssignees:async()=>[]}})('src/app/api/hr-requests/route.ts')
 const res=await route.POST({json:async()=>({requestKey:'00000000-0000-4000-8000-000000000001',category:'Payroll Clarification',subject:'Basic pay question',description:'Please review my pay.',payslipId:'other-slip',payslipItem:'Basic pay',payslipAmount:1000})});assert.equal(res.status,404);assert.equal(creates,0)
})
test('remittance preparation reuses its existing month-agency record instead of creating twice',async()=>{
 let writes=0;const db={$transaction:async fn=>fn({$executeRaw:async()=>{},hrOperation:{findUnique:async({where})=>{assert.equal(where.requestKey,'remittance:tenant:2026-11:SSS');return {id:'existing'}},create:async()=>{writes++}}})};const route=loader({'@/lib/prisma':{prisma:db},'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'tenant',userId:'user'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>true},'@/lib/hr-center/service':{jsonData:v=>v}})('src/app/api/payroll/operations/route.ts');const res=await route.POST({json:async()=>({month:'2026-11',agency:'SSS',dueDate:'2026-12-10'})});assert.equal(res.status,200);assert.deepEqual(await res.json(),{id:'existing'});assert.equal(writes,0)
})
