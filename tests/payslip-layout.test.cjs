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
for (const custom of [false,true]) test(`payslip wraps and paginates with ${custom?'custom':'default'} branding`,async()=>{
 const number={toNumber:()=>0}
 const sample=new Proxy({employeeId:'e',employee:{id:'e',employeeNo:'TEST-001',firstName:'Sample',lastName:'Employee',company:{id:'c'}},payrollRun:{periodStart:new Date('2026-11-01'),periodEnd:new Date('2026-11-15'),payDate:new Date('2026-11-20')},manualEdits:null,calculationBasis:null},{get:(target,key)=>key in target?target[key]:number})
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c'}})},'@/lib/prisma':{prisma:{company:{findUnique:async()=>({name:'Sample Company',payrollCurrency:'PHP',payslipDesign:custom?loader()('src/lib/payslip-design/schema.ts').DEFAULT_DESIGN:null})},payslip:{findFirst:async()=>sample},payslipIncome:{findMany:async()=>Array.from({length:45},(_,i)=>({typeName:`Additional income item ${i+1} with a long descriptive label`,amount:{toNumber:()=>123456.78}}))},employeeOtherDeduction:{findMany:async()=>[]}}}})('src/app/api/payroll/payslip/[payslipId]/pdf/route.ts')
 const response=await api.GET({}, {params:Promise.resolve({payslipId:'test'})})
 assert.equal(response.status,200)
 const bytes=Buffer.from(await response.arrayBuffer())
 const pdf=await PDFDocument.load(bytes)
 assert.ok(pdf.getPageCount()>1)
 fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync(`tmp/pdfs/payslip-stress${custom?'-custom':''}.pdf`,bytes)
})
