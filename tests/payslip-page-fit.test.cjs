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








const {PDFDocument}=require('pdf-lib')
const {DEFAULT_DESIGN}=loader()('src/lib/payslip-design/schema.ts')
for(const items of [1,2,30]) test(`payslip uses ${items<=2?'one page':'overflow pages'} for ${items} other deduction items`,async()=>{
 const n=v=>({toNumber:()=>v});const sample=new Proxy({employeeId:'e',basicSalary:n(30000),grossPay:n(30000),netPay:n(22015.83),totalDeductions:n(7984.17),otherDeductions:n(items*500),sssEmployee:n(875),philhealthEmployee:n(750),pagibigEmployee:n(100),withholdingTax:n(3259.17),employee:{id:'e',employeeNo:'TEST-001',firstName:'Sample',lastName:'Employee',company:{id:'c'}},payrollRun:{periodStart:new Date('2026-11-01'),periodEnd:new Date('2026-11-15'),payDate:new Date('2026-11-20')},manualEdits:null,calculationBasis:null},{get:(t,k)=>k in t?t[k]:n(0)})
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c'}})},'@/lib/prisma':{prisma:{company:{findUnique:async()=>({name:'Sample Company',payrollCurrency:'PHP',payslipDesign:DEFAULT_DESIGN})},payslip:{findFirst:async()=>sample},payslipIncome:{findMany:async()=>[]},employeeOtherDeduction:{findMany:async()=>Array.from({length:items},(_,i)=>({label:`Benefit deduction ${i+1}`,amount:500}))}}}})('src/app/api/payroll/payslip/[payslipId]/pdf/route.ts')
 const r=await api.GET({}, {params:Promise.resolve({payslipId:'test'})});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());const pdf=await PDFDocument.load(bytes);if(items<=2)assert.equal(pdf.getPageCount(),1);else assert.ok(pdf.getPageCount()>1);fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync(`tmp/pdfs/payslip-fit-${items}.pdf`,bytes)
})
