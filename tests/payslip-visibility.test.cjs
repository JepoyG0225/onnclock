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








const {spawnSync}=require('node:child_process')
const {DEFAULT_DESIGN,designSchema}=loader()('src/lib/payslip-design/schema.ts')
function extract(file) {const r=spawnSync('python',['-c','import fitz,sys; print("\\n".join(p.get_text() for p in fitz.open(sys.argv[1])))',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout}
test('older designs show deductions by default',()=>{const old={...DEFAULT_DESIGN};delete old.hideDeductions;assert.equal(designSchema.parse(old).hideDeductions,false);assert.equal(designSchema.safeParse({...old,hideDeductions:'yes'}).success,false)})
for(const hide of [false,true])test(`downloaded PDF deduction visibility ${!hide} preserves gross and net`,async()=>{
 const n=v=>({toNumber:()=>v});const sample=new Proxy({employeeId:'e',basicSalary:n(25000),grossPay:n(25000),netPay:n(23000),totalDeductions:n(2000),sssEe:n(1000),employee:{id:'e',employeeNo:'TEST-001',firstName:'Sample',lastName:'Employee',company:{id:'c'}},payrollRun:{periodStart:new Date('2026-11-01'),periodEnd:new Date('2026-11-15'),payDate:new Date('2026-11-20')},manualEdits:null,calculationBasis:null},{get:(t,k)=>k in t?t[k]:n(0)})
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c'}})},'@/lib/prisma':{prisma:{company:{findUnique:async()=>({name:'Sample Company',payrollCurrency:'PHP',payslipDesign:{...DEFAULT_DESIGN,hideDeductions:hide}})},payslip:{findFirst:async()=>sample},payslipIncome:{findMany:async()=>[]},employeeOtherDeduction:{findMany:async()=>[]}}}})('src/app/api/payroll/payslip/[payslipId]/pdf/route.ts');const r=await api.GET({}, {params:Promise.resolve({payslipId:'test'})});assert.equal(r.status,200)
 const file=`tmp/pdfs/payslip-deductions-${hide?'hidden':'visible'}.pdf`;fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));const text=extract(file);assert.equal(text.includes('TOTAL DEDUCTIONS'),!hide);assert.equal(text.includes('YTD Withholding Tax'),!hide);assert.ok(text.includes('25,000.00'));assert.ok(text.includes('23,000.00'));assert.ok(text.includes('NET PAY'))
})
test('preview hides deductions and retains accurate sample net pay',async()=>{
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c',role:'COMPANY_ADMIN',userId:'u'}})},'@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>['payroll:read']},'@/lib/prisma':{prisma:{company:{findUnique:async()=>({name:'Sample Company'})}}}})('src/app/api/payroll/payslip-design/preview/route.ts');const r=await api.POST({text:async()=>JSON.stringify({...DEFAULT_DESIGN,hideDeductions:true})});assert.equal(r.status,200);const file='tmp/pdfs/payslip-preview-hidden.pdf';fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));const text=extract(file);assert.ok(!text.includes('DEDUCTIONS'));assert.ok(text.includes('23,000.00'))
})
test('payslip announcement is targeted and expires after three days',()=>{const {productRelease}=loader()('src/lib/product-updates.ts');const now=new Date('2026-11-20T12:00:00+08:00');assert.ok(productRelease('COMPANY_ADMIN',['payroll:read'],now));assert.equal(productRelease('EMPLOYEE',['payroll:read'],now),null);assert.equal(productRelease('HR_MANAGER',[],now),null);assert.equal(productRelease('COMPANY_ADMIN',['payroll:read'],new Date('2026-11-23T00:00:00+08:00')),null)})

for(const [early,beyond] of [[false,false],[true,false],[false,true],[true,true]])test(`OT block visibility with early disabled ${early} and beyond disabled ${beyond}`,async()=>{
 const hide=false; const n=v=>({toNumber:()=>v});const sample=new Proxy({employeeId:'e',basicSalary:n(25000),grossPay:n(25000),netPay:n(23000),totalDeductions:n(2000),sssEe:n(1000),employee:{disableEarlyInOt:early,disableBeyondScheduleOt:beyond,id:'e',employeeNo:'TEST-001',firstName:'Sample',lastName:'Employee',company:{id:'c'}},payrollRun:{periodStart:new Date('2026-11-01'),periodEnd:new Date('2026-11-15'),payDate:new Date('2026-11-20')},manualEdits:null,calculationBasis:null},{get:(t,k)=>k in t?t[k]:n(0)})
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c'}})},'@/lib/prisma':{prisma:{company:{findUnique:async()=>({name:'Sample Company',payrollCurrency:'PHP',payslipDesign:{...DEFAULT_DESIGN,hideDeductions:hide}})},payslip:{findFirst:async()=>sample},payslipIncome:{findMany:async()=>[]},employeeOtherDeduction:{findMany:async()=>[]}}}})('src/app/api/payroll/payslip/[payslipId]/pdf/route.ts');const r=await api.GET({}, {params:Promise.resolve({payslipId:'test'})});assert.equal(r.status,200)
 const file=`tmp/pdfs/payslip-ot-${early}-${beyond}.pdf`;fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));const text=extract(file);assert.equal(text.includes('TOTAL DEDUCTIONS'),!hide);assert.equal(text.includes('YTD Withholding Tax'),!hide);assert.ok(text.includes('25,000.00'));assert.ok(text.includes('23,000.00'));assert.ok(text.includes('NET PAY'));assert.equal(text.includes('OVERTIME'),!(early&&beyond));assert.equal(text.includes('0.00 OT hours'),!(early&&beyond));assert.ok(text.includes('ADDITIONAL EARNINGS'))
})