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

const {Prisma}=require('@prisma/client')
const load=loader()
const {deleteEmployeePermanently}=load('src/lib/employees/delete.ts')
function fixture() {
 const calls=[]
 const tx=new Proxy({}, {get:(_,model)=>new Proxy({}, {get:(_,method)=>async args=>{
  calls.push({model,method,args})
  if(model==='payrollRun'&&method==='findMany')return [{id:'run',employeeIds:['target','other']}]
  if(model==='payslip'&&method==='aggregate')return {_sum:{basicSalary:100,grossPay:120,totalDeductions:20,netPay:100,sssEmployer:5,philhealthEmployer:6,pagibigEmployer:7}}
  if(method==='count')return 0
  return {count:1}
 }})})
 return {tx,calls}
}
test('permanent delete clears restricted dependencies before employee and reconciles payroll',async()=>{
 const {tx,calls}=fixture()
 await deleteEmployeePermanently(tx,{id:'target',companyId:'company',userId:'user'})
 const deleted=calls.filter(c=>c.method==='deleteMany').map(c=>c.model)
 const required=Prisma.dmmf.datamodel.models.filter(m=>m.fields.some(f=>f.kind==='object'&&f.type==='Employee'&&f.isRequired&&f.relationFromFields.length&&f.relationOnDelete!=='Cascade'))
 for(const model of required) assert.ok(deleted.includes(model.name[0].toLowerCase()+model.name.slice(1)),model.name)
 assert.ok(calls.findIndex(c=>c.model==='payslipLoanDeduction')<calls.findIndex(c=>c.model==='payslip'&&c.method==='deleteMany'))
 assert.ok(calls.findIndex(c=>c.model==='leaveEncashment')<calls.findIndex(c=>c.model==='leaveBalance'))
 const totals=calls.find(c=>c.model==='payrollRun'&&c.method==='update').args.data
 assert.equal(totals.totalNetPay,100);assert.deepEqual(totals.employeeIds,['other'])
 assert.deepEqual(calls.find(c=>c.model==='employee'&&c.method==='delete').args.where,{id:'target'})
 assert.deepEqual(calls.find(c=>c.model==='userCompany').args.where,{userId:'user',companyId:'company',role:'EMPLOYEE'})
 assert.ok(!calls.some(c=>c.model==='user'&&c.method==='delete'))
})
function apiFixture(allowed=true,record={id:'target',companyId:'company',userId:null,employeeNo:'EMP1',isActive:true}) {
 const calls=[]; let purged=false
 const tx={$executeRaw:async()=>{},$queryRaw:async()=>[],employee:{findFirst:async args=>{calls.push(args);return record},update:async args=>{calls.push(args)}},auditLog:{create:async args=>{calls.push(args)}}}
 const route=loader({
  '@/lib/prisma':{prisma:{$transaction:async callback=>callback(tx)}},
  '@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company',userId:'admin',role:'COMPANY_ADMIN'},error:null})},
  '@/lib/auth/effective-permissions':{ctxHasPermission:async()=>allowed},
  '@/lib/employees/delete':{deleteEmployeePermanently:async()=>{purged=true}},
  '@/lib/audit':{logAudit:async()=>{}},
  '@/lib/payroll/recompute-runs':{},'@/lib/billing/seat-limit':{},
  '@/lib/billing/credit':{issueDeactivationCredit:async()=>({amount:0})},
 })('src/app/api/employees/[id]/route.ts')
 const request=body=>route.DELETE(new Request('https://example.com/api/employees/target',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:'target'})})
 return {request,calls,purged:()=>purged}
}
test('delete API enforces permission and typed confirmation',async()=>{
 assert.equal((await apiFixture(false).request({action:'permanent',confirmation:'DELETE'})).status,403)
 const f=apiFixture();assert.equal((await f.request({action:'permanent'})).status,400);assert.equal(f.calls.length,0)
})
test('inactive option preserves records; permanent option works for an inactive employee',async()=>{
 const inactive=apiFixture();assert.equal((await inactive.request({action:'inactive'})).status,200);assert.equal(inactive.purged(),false)
 assert.ok(inactive.calls.some(c=>c.data?.isActive===false))
 const permanent=apiFixture(true,{id:'target',companyId:'company',userId:null,employeeNo:'EMP1',isActive:false})
 assert.equal((await permanent.request({action:'permanent',confirmation:'DELETE'})).status,200);assert.equal(permanent.purged(),true)
 assert.deepEqual(permanent.calls[0].where,{id:'target',companyId:'company'})
})
test('another company employee is not found and never deleted',async()=>{
 const f=apiFixture(true,null);assert.equal((await f.request({action:'permanent',confirmation:'DELETE'})).status,404);assert.equal(f.purged(),false)
})
