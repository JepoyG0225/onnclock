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







const {DEFAULT_DESIGN,designSchema}=loader()('src/lib/payslip-design/schema.ts')
const {PDFDocument}=require('pdf-lib')
test('schema accepts defaults and rejects out-of-bounds and external image URLs',()=>{
 assert.equal(designSchema.safeParse(DEFAULT_DESIGN).success,true)
 const d=structuredClone(DEFAULT_DESIGN);d.header[0].x=590
 assert.equal(designSchema.safeParse(d).success,false)
 d.header[0]={...DEFAULT_DESIGN.header[0],kind:'logo',image:'https://example.com/image.png'}
 assert.equal(designSchema.safeParse(d).success,false)
})
test('design write requires editing permission and scopes save to authenticated company',async()=>{
 let permissions=['payroll:read'],saved=null
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company-a',role:'CUSTOM',userId:'u'}})},'@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>permissions},'@/lib/prisma':{prisma:{company:{findUnique:async p=>{assert.equal(p.where.id,'company-a');return {name:'Sample Company',payslipDesign:null}},update:async p=>{saved=p;return {}}}}}})('src/app/api/payroll/payslip-design/route.ts')
 assert.equal((await api.GET()).status,200)
 const req={text:async()=>JSON.stringify({...DEFAULT_DESIGN,hideDeductions:true,companyId:'company-b'})}
 assert.equal((await api.PUT(req)).status,403);assert.equal(saved,null)
 permissions=['payroll:read','payroll:write']
 assert.equal((await api.PUT(req)).status,200);assert.equal(saved.where.id,'company-a');assert.equal(saved.data.payslipDesign.hideDeductions,true);assert.equal(saved.data.payslipDesign.primary,DEFAULT_DESIGN.primary)
 const overflow=structuredClone(DEFAULT_DESIGN);overflow.header[0].text='A very long paragraph '.repeat(20);overflow.header[0].width=30
 assert.equal((await api.PUT({text:async()=>JSON.stringify(overflow)})).status,422)
})
test('preview renders custom colors, company details, formatting and uploaded logo',async()=>{
 const sharp=require('sharp');const logo=await sharp({create:{width:80,height:40,channels:4,background:'#22c55e'}}).png().toBuffer()
 const d=structuredClone(DEFAULT_DESIGN);d.primary='#6340a0';d.headerBackground='#103c3a';d.header[1].x=120;d.header[1].width=450
 d.header.push({...d.header[0],id:'logo',kind:'logo',image:`data:image/png;base64,${logo.toString('base64')}`,x:24,y:20,width:80,height:45})
 d.footer[0].text='Thank you for your contribution.';d.footer[0].font='serif';d.footer[0].italic=true;d.footer[0].align='center';d.footer[0].underline=true
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c',role:'COMPANY_ADMIN',userId:'u'}})},'@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>['payroll:read','payroll:write']},'@/lib/prisma':{prisma:{company:{findUnique:async()=>({name:'SAMPLE COMPANY',address:'123 Business Avenue, Metro Manila',tin:'000-000-000'})}}}})('src/app/api/payroll/payslip-design/preview/route.ts')
 const r=await api.POST({text:async()=>JSON.stringify(d)})
 assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1)
 fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync('tmp/pdfs/payslip-design-preview.pdf',bytes)
})
