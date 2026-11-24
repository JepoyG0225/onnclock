const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { Prisma } = require('@prisma/client')

// Transpile the actual TypeScript modules and inject only infrastructure boundaries.
// No test database, credentials, network, or changes to production data are needed.
function loader(overrides = {}) {
  overrides = { '@/lib/hris-pro': { requireHrisProOrTrialApi: async () => null }, ...overrides }
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name]
      if (name.startsWith('@/')) return load(path.join('src', name.slice(2)) + '.ts')
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts')
      return require(name)
    }
    new Function('require', 'module', 'exports', source)(localRequire, module, module.exports)
    return module.exports
  }
  return load
}

const { PDFDocument } = require('pdf-lib')
const sharp = require('sharp')
const load = loader()
const { templateFieldsSchema, snapshotTemplate, fillCertificateText } = load('src/lib/learning/certificate-template.ts')
const field = { id:'name', text:'{{employee_name}}', x:10, y:45, width:80, fontSize:36, bold:true, color:'#172554', align:'center' }
test('template validation rejects unknown variables and off-page fields', () => {
  assert.equal(templateFieldsSchema.safeParse([field]).success, true)
  assert.equal(templateFieldsSchema.safeParse([{...field,text:'{{password}}'}]).success, false)
  assert.equal(templateFieldsSchema.safeParse([{...field,x:90}]).success, false)
  assert.equal(templateFieldsSchema.safeParse([field,field]).success, false)
  assert.equal(fillCertificateText('Awarded to {{employee_name}}', {employee_name:'Jos\u00e9 Dela Cruz'}), 'Awarded to Jos\u00e9 Dela Cruz')
})
test('certificate snapshot does not retain mutable template metadata', () => {
  const template = {backgroundPath:'company/test.png',backgroundMime:'image/png',width:842,height:595,fields:[field],id:'template',companyId:'company'}
  const snap = snapshotTemplate(template)
  template.fields[0].text = 'Changed'
  assert.equal(snap.fields[0].text, '{{employee_name}}')
  assert.equal(snap.companyId, undefined)
  field.text = '{{employee_name}}'
})
test('PDF output embeds artwork and supports accented names and long text', async () => {
  const background = await sharp(Buffer.from(`<svg width="1191" height="842" xmlns="http://www.w3.org/2000/svg"><rect width="1191" height="842" fill="#fffcf5"/><rect x="25" y="25" width="1141" height="792" fill="none" stroke="#172554" stroke-width="5"/><text x="595" y="175" text-anchor="middle" font-family="serif" font-size="48" fill="#172554">CERTIFICATE OF COMPLETION</text><text x="595" y="290" text-anchor="middle" font-family="sans-serif" font-size="24">This certifies that</text></svg>`)).png().toBuffer()
  const template = {backgroundPath:'company/test.png',backgroundMime:'image/png',width:842,height:595,fields:[field,{...field,id:'course',text:'{{course_title}}',y:60,fontSize:22,bold:false},{...field,id:'date',text:'Issued {{issued_date}}',y:76,fontSize:16,bold:false}]}
  const bytes = await load('src/lib/learning/certificate-pdf.ts').renderCertificate(template,background,{employee_name:'Jos\u00e9 Mar\u00eda Pe\u00f1aflor Dela Cruz',course_title:'Workplace Safety and Professional Development',issued_date:'October 15, 2026'})
  const doc = await PDFDocument.load(bytes)
  assert.equal(doc.getPageCount(),1)
  assert.equal(doc.getPage(0).getWidth(),842)
  if(process.env.CERTIFICATE_VISUAL_CHECK){fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync('tmp/pdfs/certificate-preview.pdf',bytes)}
})
for (const role of ['EMPLOYEE','HR_MANAGER']) test(`certificate download checks tenant and ownership for ${role}`, async () => {
  let query
  const route = loader({
    '@/lib/api-auth': {requireAuth:async()=>({ctx:{companyId:'company',userId:'user',role}})},
    '@/lib/prisma': {prisma:{employeeCertification:{findFirst:async args=>{query=args;return null}}}},
    '@/lib/learning/certificate-storage': {certificateStorage:async()=>{throw Error('Must not read storage')}},
  })('src/app/api/learning/certifications/[id]/download/route.ts')
  const response=await route.GET({}, {params:Promise.resolve({id:'other-certificate'})})
  assert.equal(response.status,404)
  assert.equal(query.where.employee.companyId,'company')
  if(role==='EMPLOYEE') assert.equal(query.where.employee.userId,'user')
})
test('template uploads reject employees before accessing storage', async () => {
  const route=loader({'@/lib/api-auth':{requireAuth:async roles=>{assert.ok(!roles.includes('EMPLOYEE'));return {error:new Response(null,{status:403})}}},'@/lib/prisma':{prisma:{}}})('src/app/api/learning/certificate-templates/route.ts')
  assert.equal((await route.POST({})).status,403)
})

test('manual issuance only accepts a template in the current company', async () => {
  let templateQuery
  const route=loader({
    '@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company',role:'HR_MANAGER'}})},
    '@/lib/audit':{logAudit:async()=>{}},
    '@/lib/prisma':{prisma:{employee:{findFirst:async()=>({id:'employee'})},certificateTemplate:{findFirst:async args=>{templateQuery=args;return null}},employeeCertification:{create:async()=>{throw Error('Must not create')}}}},
  })('src/app/api/learning/route.ts')
  const result=await route.POST({json:async()=>({action:'certification',employeeId:'employee',name:'Safety',templateId:'other-template'})})
  assert.equal(result.status,404)
  assert.equal(templateQuery.where.companyId,'company')
})
test('manual issuance stores a copy of the template layout', async () => {
  let saved
  const template={backgroundPath:'company/test.png',backgroundMime:'image/png',width:842,height:595,fields:[field]}
  const route=loader({
    '@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company',role:'HR_MANAGER'}})},
    '@/lib/audit':{logAudit:async()=>{}},
    '@/lib/prisma':{prisma:{employee:{findFirst:async()=>({id:'employee'})},certificateTemplate:{findFirst:async()=>template},employeeCertification:{create:async args=>{saved=args.data;return {id:'certificate'}}}}},
  })('src/app/api/learning/route.ts')
  const result=await route.POST({json:async()=>({action:'certification',employeeId:'employee',name:'Safety',templateId:'template'})})
  assert.equal(result.status,201)
  assert.ok(saved.issuedDate instanceof Date)
  assert.equal(saved.issuedDate.toISOString(),load('src/lib/learning/certificate-date.ts').certificateIssueDate().toISOString())
  assert.equal(saved.templateSnapshot.fields[0].text,'{{employee_name}}')
  assert.notEqual(saved.templateSnapshot.fields,template.fields)
})

test('certificate fonts validate, preserve legacy defaults and render every style', async () => {
  const {certificateFonts, certificateFontIds} = load('src/lib/learning/certificate-fonts.ts')
  assert.equal(templateFieldsSchema.parse([field])[0].fontFamily, 'montserrat')
  assert.equal(templateFieldsSchema.safeParse([{...field,fontFamily:'../../secret'}]).success, false)
  const background = await sharp({create:{width:842,height:1000,channels:3,background:'#ffffff'}}).png().toBuffer()
  const fields = certificateFontIds.flatMap((id,index)=>[
    {...field,id:'label-'+id,text:certificateFonts[id].label,fontFamily:'montserrat',bold:false,fontSize:14,y:4+index*16},
    {...field,id:'sample-'+id,text:'Jos\u00e9 Pe\u00f1aflor - Excellence',fontFamily:id,bold:false,fontSize:36,y:7+index*16},
  ])
  const template={backgroundPath:'company/font-check.png',backgroundMime:'image/png',width:842,height:1000,fields}
  const render=load('src/lib/learning/certificate-pdf.ts').renderCertificate
  const bytes=await render(template,background,{})
  assert.equal((await PDFDocument.load(bytes)).getPageCount(),1)
  const boldBytes=await render({...template,fields:fields.map(f=>({...f,bold:true}))},background,{})
  assert.equal((await PDFDocument.load(boldBytes)).getPageCount(),1)
  if(process.env.CERTIFICATE_FONT_VISUAL_CHECK){fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync('tmp/pdfs/certificate-fonts.pdf',bytes)}
})

test('automatic issue date uses Manila midnight and permits a deliberate date override', () => {
  const {certificateIssueDate} = load('src/lib/learning/certificate-date.ts')
  assert.equal(certificateIssueDate(undefined,new Date('2026-10-15T15:59:59Z')).toISOString(),'2026-10-15T00:00:00.000Z')
  assert.equal(certificateIssueDate('',new Date('2026-10-15T16:00:00Z')).toISOString(),'2026-10-16T00:00:00.000Z')
  assert.equal(certificateIssueDate('2026-09-20').toISOString(),'2026-09-20T00:00:00.000Z')
  assert.throws(()=>certificateIssueDate('2026-02-30'))
  assert.throws(()=>certificateIssueDate('invalid'))
})

test('certificate edge resizing keeps opposite edge fixed and stays within page', () => {
  const { resizeCertificateField } = loader()('src/lib/learning/certificate-resize.ts')
  assert.deepEqual(resizeCertificateField(10, 60, 'left', 20), { x: 30, width: 40 })
  assert.deepEqual(resizeCertificateField(10, 60, 'left', -50), { x: 0, width: 70 })
  assert.deepEqual(resizeCertificateField(10, 60, 'left', 100), { x: 69, width: 1 })
  assert.deepEqual(resizeCertificateField(10, 60, 'right', 100), { x: 10, width: 90 })
  assert.deepEqual(resizeCertificateField(10, 60, 'right', -100), { x: 10, width: 1 })
})
