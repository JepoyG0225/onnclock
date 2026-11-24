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



const policy=loader()('src/lib/hr-center/policy.ts')
const profile=loader()('src/lib/hr-center/profile.ts')
const reconcile=loader()('src/lib/hr-center/reconciliation.ts')
test('wage checks use explicit pay bases and never treat missing daily rates as compliant',()=>{
 const rule={minimumDaily:650,monthlyDivisor:261,hoursPerDay:8}
 assert.equal(policy.wageResult({rateType:'MONTHLY',basicSalary:15000},rule).status,'MEETS_CONFIGURED_RATE')
 assert.equal(policy.wageResult({rateType:'HOURLY',hourlyRate:75},rule).gap,-50)
 assert.equal(policy.wageResult({rateType:'DAILY',dailyRate:null},rule).status,'MISSING_RATE')
})
test('filings and reimbursements require references, dates and consistent amounts',()=>{
 assert.ok(policy.validateState('COMPLIANCE','COMPLETED',{reference:'',submittedDate:null},'2026-10-30'))
 assert.ok(policy.validateState('SSS_CASE','REIMBURSED',{notificationDate:'2026-10-01',filingDate:'2026-10-10',reference:'R',reimbursementDate:'2026-10-20',approvedAmount:100,reimbursedAmount:101},'2026-10-30'))
 assert.equal(policy.validateState('SSS_CASE','REIMBURSED',{notificationDate:'2026-10-01',filingDate:'2026-10-10',reference:'R',reimbursementDate:'2026-10-20',approvedAmount:100,reimbursedAmount:100},'2026-10-30'),null)
 assert.ok(policy.validateState('CONTRACT','REGULARIZED',{effectiveDate:'2099-01-01',notes:'Reviewed'},'2026-10-30'))
})
test('document variables resolve while unknown variables are rejected',()=>{assert.equal(policy.renderTemplate('Hello {{employee_name}}, {{date_issued}}',{employee_name:'Ana',date_issued:'2026-10-27'}),'Hello Ana, 2026-10-27');assert.throws(()=>policy.renderTemplate('{{password}}',{}),/Unknown variable/)})
test('profile diffs preserve omitted fields and approval rejects changed source values',()=>{
 assert.deepEqual(profile.changesFor({mobileNo:'old',sssNo:'private'},{mobileNo:null}),{mobileNo:{before:'old',after:null}})
 assert.throws(()=>profile.approvedProfileData({mobileNo:'changed'},{mobileNo:{before:'old',after:'new'}}),/changed since/)
 const data=profile.approvedProfileData({mobileNo:'old'},{mobileNo:{before:'old',after:'new'},basicSalary:{before:null,after:90000}})
 assert.equal(data.mobileNo,'new');assert.equal(data.basicSalary,undefined)
})
test('reconciliation catches arithmetic mismatch and uses snapshots rather than current attendance',()=>{
 const slip={basicSalary:1000,otherEarnings:100,grossPay:1100,totalDeductions:100,sssEmployee:100,netPay:999,calculationBasis:{calculatedValues:{basicSalary:950}},manualEdits:{basicSalary:1000}}
 const result=reconcile.reconcileSlip(slip,{netPay:800});assert.equal(result.expected.netPay,1000);assert.ok(result.findings.some(f=>f.startsWith('netPay:')));assert.ok(result.findings.some(f=>f.includes('Manual basic-pay adjustment')));assert.equal(result.netChange,199)
})
function setup({kind='PROFILE_CHANGE',status='PENDING',manager=true,employeeId='reviewer',version=1}={}){
 const writes=[],reads=[]
 const current={id:'record',companyId:'company',kind,status,employeeId:'owner',version,title:'Record',data:{changes:{mobileNo:{before:'old',after:'new'}}}}
 const tx={$queryRaw:async()=>{},hrOperation:{findUniqueOrThrow:async()=>current,update:async args=>{writes.push(args);return {...current,...args.data}}},hrOperationEvent:{create:async args=>writes.push(args)},employee:{findFirst:async()=>({id:'owner',isActive:true,mobileNo:'old',userId:null}),update:async args=>writes.push(args)},notification:{create:async args=>writes.push(args)}}
 const api=loader({'@/lib/hr-center/access':{hrAccess:async()=>({ctx:{companyId:'company',userId:'actor'},kinds:manager?[kind]:[],employeeId}),personSelect:{id:true},fileSelect:{id:true},ownVisible:(k)=>['DOCUMENT','PROFILE_CHANGE'].includes(k)},'@/lib/prisma':{prisma:{hrOperation:{findFirst:async args=>{reads.push(args);return current}},$transaction:async fn=>fn(tx)}}})('src/app/api/hr-center/[id]/route.ts')
 return {writes,reads,get:()=>api.GET({}, {params:Promise.resolve({id:'record'})}),patch:body=>api.PATCH({json:async()=>body},{params:Promise.resolve({id:'record'})})}
}
test('record reads enforce company and prevent another employee from reading profile history',async()=>{const s=setup({manager:false});assert.equal((await s.get()).status,404);assert.equal(s.reads[0].where.companyId,'company')})
test('record update rejects outdated version without writing',async()=>{const s=setup();assert.equal((await s.patch({action:'APPROVE',version:2,note:'Verified'})).status,409);assert.equal(s.writes.length,0)})
test('managers cannot approve their own profile changes',async()=>{const s=setup({employeeId:'owner'});assert.equal((await s.patch({action:'APPROVE',version:1,note:'Verified'})).status,403);assert.equal(s.writes.length,0)})
test('authorized independent reviewer applies only approved changed fields',async()=>{const s=setup();assert.equal((await s.patch({action:'APPROVE',version:1,note:'Verified ID'})).status,200);assert.deepEqual(s.writes[0].data,{mobileNo:'new'});assert.equal(s.writes[1].data.status,'APPROVED')})
test('only document recipient can acknowledge receipt',async()=>{const other=setup({kind:'DOCUMENT',status:'ISSUED'});assert.equal((await other.patch({action:'ACKNOWLEDGE',version:1})).status,403);const own=setup({kind:'DOCUMENT',status:'ISSUED',manager:false,employeeId:'owner'});assert.equal((await own.patch({action:'ACKNOWLEDGE',version:1})).status,200);assert.equal(own.writes[0].data.status,'ACKNOWLEDGED');assert.ok(own.writes[0].data.acknowledgedAt instanceof Date)})
test('void documents cannot be acknowledged and issued content cannot be edited',async()=>{const s=setup({kind:'DOCUMENT',status:'VOID',employeeId:'owner'});assert.equal((await s.patch({action:'ACKNOWLEDGE',version:1})).status,403);assert.equal((await s.patch({version:1,title:'Changed document',employeeId:'owner',ownerId:null,dueDate:null,status:'ISSUED',data:{}})).status,422);assert.equal(s.writes.length,0)})
test('employees cannot approve other peoples profile requests',async()=>{const s=setup({manager:false});assert.equal((await s.patch({action:'APPROVE',version:1,note:'Verified'})).status,403);assert.equal(s.writes.length,0)})
test('wage orders require official sources and explicit covered employees',()=>{const data={region:'NCR',sector:'Non-agriculture',orderNumber:'Test',effectiveDate:'2026-10-27',minimumDaily:650,hoursPerDay:8,monthlyDivisor:261,sourceUrl:'https://example.com/wage',employeeIds:['e']};assert.equal(policy.payloadSchemas.WAGE_ORDER.safeParse(data).success,false);assert.equal(policy.payloadSchemas.WAGE_ORDER.safeParse({...data,sourceUrl:'https://nwpc.dole.gov.ph/orders',employeeIds:[]}).success,false)})
test('private evidence downloads are restricted to granted modules in the current company',async()=>{
 let query
 const api=loader({'@/lib/hr-center/access':{hrAccess:async()=>({ctx:{companyId:'company'},kinds:['CONTRACT']})},'@/lib/prisma':{prisma:{hrOperationFile:{findFirst:async args=>{query=args;return null}}}},'@/lib/hr-requests/storage':{hrRequestStorage:async()=>{throw new Error('Must not reach storage')}}})('src/app/api/hr-center/[id]/files/[fileId]/route.ts')
 assert.equal((await api.GET({}, {params:Promise.resolve({id:'record',fileId:'file'})})).status,404);assert.deepEqual(query.where.operation,{companyId:'company',kind:{in:['CONTRACT']}})
})

test('approval-enabled self-service stores a request without changing the employee',async()=>{
 const writes=[],records=[];const stored={id:'e',mobileNo:'old',sssNo:'original'}
 const tx={$queryRaw:async()=>{},employee:{findFirstOrThrow:async()=>stored,findUniqueOrThrow:async()=>stored,update:async a=>writes.push(a)},company:{findUniqueOrThrow:async()=>({hrOperationsSettings:{...policy.defaultSettings,profileApproval:true}})},hrOperation:{findMany:async()=>[],create:async a=>{records.push(a);return{id:'r'}}},hrOperationEvent:{create:async()=>{}}}
 const lib=loader({'@/lib/prisma':{prisma:{$transaction:async fn=>fn(tx)}},'./reminders':{authorizedStaff:async()=>[]}})('src/lib/hr-center/save-profile.ts')
 const result=await lib.saveProfileChange('c','e','u',{mobileNo:'new'});assert.equal(result.pending,true);assert.equal(writes.length,0);assert.equal(records[0].data.status,'PENDING');assert.deepEqual(records[0].data.data.changes,{mobileNo:{before:'old',after:'new'}});assert.equal(result.employee.sssNo,'original')
})
test('overlapping pending profile edits cannot create conflicting approval requests',async()=>{
 const tx={$queryRaw:async()=>{},employee:{findFirstOrThrow:async()=>({mobileNo:'old'})},company:{findUniqueOrThrow:async()=>({hrOperationsSettings:{...policy.defaultSettings,profileApproval:true}})},hrOperation:{findMany:async()=>[{data:{changes:{mobileNo:{before:'old',after:'earlier'}}}}],create:async()=>{throw new Error('Must not write')}}}
 const lib=loader({'@/lib/prisma':{prisma:{$transaction:async fn=>fn(tx)}},'./reminders':{authorizedStaff:async()=>[]}})('src/lib/hr-center/save-profile.ts')
 await assert.rejects(()=>lib.saveProfileChange('c','e','u',{mobileNo:'new'}),/already pending/)
})
test('reminders are once per PH date and notify only currently authorized staff',async()=>{
 let claimed=false;const notifications=[]
 const record={id:'r',companyId:'c',kind:'SSS_CASE',status:'APPROVED',dueDate:new Date('2026-01-01'),ownerId:'former-hr',version:1,title:'Case'}
 const db={hrOperation:{findMany:async()=>[record]},userCompany:{findMany:async()=>[{userId:'hr',role:'HR_MANAGER'},{userId:'former-hr',role:'EMPLOYEE'}]},$transaction:async fn=>fn({hrOperation:{updateMany:async()=>{if(claimed)return{count:0};claimed=true;return{count:1}}},notification:{createMany:async a=>notifications.push(...a.data)}})}
 const lib=loader({'@/lib/prisma':{prisma:db},'@/lib/auth/effective-permissions':{getEffectivePermissions:async role=>role==='HR_MANAGER'?['ssscases:manage']:[]}})('src/lib/hr-center/reminders.ts')
 assert.equal(await lib.sendHrReminders(),1);assert.equal(await lib.sendHrReminders(),0);assert.equal(notifications[0].userId,'hr')
})
test('document generation stores an employee snapshot with automatic Philippine issue date',async()=>{
 const employee={id:'e',firstName:'Ana',lastName:'Cruz',employeeNo:'001',hireDate:new Date('2025-01-01'),employmentStatus:'REGULAR',position:{title:'Tutor'},department:{name:'Learning'}}
 const lib=loader({'@/lib/prisma':{prisma:{employee:{findFirst:async()=>employee},hrOperation:{findFirst:async()=>({version:3,title:'COE',data:{body:'{{employee_name}} | {{position}} | {{date_issued}}'}})},company:{findUniqueOrThrow:async()=>({name:'Company'})}}}})('src/lib/hr-center/service.ts')
 const {payload}=await lib.prepareData('c','DOCUMENT',{templateId:'template',purpose:'Bank',signatory:'HR'},'e',null,'ISSUED',null)
 assert.equal(payload.body,'Ana Cruz | Tutor | '+policy.phToday());assert.equal(payload.templateVersion,3);employee.firstName='Changed';assert.equal(payload.variables.employee_name,'Ana Cruz')
})


test('company headers are opt-in and escape text and reject unsafe image sources',()=>{
 const {documentHeaderHtml,documentHeaderSchema}=loader()('src/lib/hr-center/document-header.ts')
 assert.equal(documentHeaderHtml(undefined),'')
 assert.equal(documentHeaderHtml({enabled:false,text:'Company'}),'')
 assert.match(documentHeaderHtml({enabled:true,text:'<script>alert(1)</script>',alignment:'left'}),/&lt;script&gt;/)
 assert.equal(documentHeaderSchema.safeParse({enabled:true,image:'javascript:alert(1)'}).success,false)
 assert.equal(documentHeaderSchema.safeParse({enabled:true,image:'data:image/svg+xml;base64,AAAA'}).success,false)
 assert.equal(documentHeaderSchema.safeParse({enabled:true,alignment:'left;position:fixed'}).success,false)
})

test('issued documents snapshot the selected template header and preview hash changes with header edits',async()=>{
 const header={enabled:true,text:'Example Company\nManila',image:'',alignment:'center'}
 const employee={firstName:'Ana',lastName:'Cruz',employeeNo:'001',hireDate:new Date('2025-01-01'),employmentStatus:'REGULAR'}
 const lib=loader({'@/lib/prisma':{prisma:{employee:{findFirst:async()=>employee},hrOperation:{findFirst:async()=>({version:1,title:'COE',data:{body:'Hello {{employee_name}}',header}})},company:{findUniqueOrThrow:async()=>({name:'Company'})}}}})('src/lib/hr-center/service.ts')
 const issue=()=>lib.prepareData('c','DOCUMENT',{templateId:'t',purpose:'Bank',signatory:'HR'},'e',null,'ISSUED',null)
 const first=(await issue()).payload
 header.text='Changed Company'
 const next=(await issue()).payload
 assert.equal(first.header.text,'Example Company\nManila')
 assert.notEqual(JSON.stringify(first),JSON.stringify(next))
 await assert.rejects(()=>lib.prepareData('c','TEMPLATE',{body:'Example body',header:{enabled:true}},null,null,'ACTIVE',null),/Add company details/)
 await assert.rejects(()=>lib.prepareData('c','TEMPLATE',{body:'Example body',header:{enabled:true,image:'data:image/png;base64,AAAA'}},null,null,'ACTIVE',null),/valid PNG or JPEG/)
})

test('company footers render safely and remain fixed on issued document snapshots',async()=>{
 const {documentHeaderHtml}=loader()('src/lib/hr-center/document-header.ts')
 assert.equal(documentHeaderHtml(undefined,'footer'),'')
 const footer={enabled:true,text:'Confidential <internal>',image:'',alignment:'right'}
 assert.match(documentHeaderHtml(footer,'footer'),/^<footer.*border-top:/)
 assert.match(documentHeaderHtml(footer,'footer'),/Confidential &lt;internal&gt;/)
 const employee={firstName:'Ana',lastName:'Reyes',employeeNo:'E1',hireDate:new Date('2020-01-01'),employmentStatus:'REGULAR'}
 const lib=loader({'@/lib/prisma':{prisma:{employee:{findFirst:async()=>employee},hrOperation:{findFirst:async()=>({version:1,title:'COE',data:{body:'Hello {{employee_name}}',footer}})},company:{findUniqueOrThrow:async()=>({name:'Company'})}}}})('src/lib/hr-center/service.ts')
 const issue=()=>lib.prepareData('c','DOCUMENT',{templateId:'t',purpose:'Bank',signatory:'HR'},'e',null,'ISSUED',null)
 const first=(await issue()).payload
 footer.text='Updated footer'
 const second=(await issue()).payload
 assert.equal(first.footer.text,'Confidential <internal>')
 assert.notEqual(JSON.stringify(first),JSON.stringify(second))
 await assert.rejects(()=>lib.prepareData('c','TEMPLATE',{body:'Example body',footer:{enabled:true}},null,null,'ACTIVE',null),/footer image/)
 await assert.rejects(()=>lib.prepareData('c','TEMPLATE',{body:'Example body',footer:{enabled:true,image:'data:image/png;base64,AAAA'}},null,null,'ACTIVE',null),/valid PNG or JPEG footer/)
})

test('rich document bodies preserve formatting and reject executable content',()=>{
 const {documentBodyHtml,cleanDocumentHtml}=loader()('src/lib/hr-center/document-body.ts')
 assert.equal(documentBodyHtml('<b>literal</b>\nNext','PLAIN'),'&lt;b&gt;literal&lt;/b&gt;<br>Next')
 const html=cleanDocumentHtml('<h1 style="text-align:center" onclick="alert(1)">Title</h1><p><strong>Bold</strong></p><script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://example.com"></iframe>')
 assert.match(html,/<h1 style="text-align:center">Title<\/h1>/)
 assert.match(html,/<strong>Bold<\/strong>/)
 assert.doesNotMatch(html,/script|onclick|onerror|iframe|<img/)
})
test('rich documents safely substitute employee details and snapshot their format',async()=>{
 const template={body:'<h1>Certificate</h1><p>{{employee_name}}</p>',bodyFormat:'HTML'}
 const employee={firstName:'<img src=x onerror=alert(1)>',lastName:'Reyes',employeeNo:'E1',hireDate:new Date('2020-01-01'),employmentStatus:'REGULAR'}
 const lib=loader({'@/lib/prisma':{prisma:{employee:{findFirst:async()=>employee},hrOperation:{findFirst:async()=>({version:1,title:'COE',data:template})},company:{findUniqueOrThrow:async()=>({name:'Company'})}}}})('src/lib/hr-center/service.ts')
 const {payload}=await lib.prepareData('c','DOCUMENT',{templateId:'t',purpose:'Bank',signatory:'HR'},'e',null,'ISSUED',null)
 assert.equal(payload.bodyFormat,'HTML')
 assert.match(payload.body,/<h1>Certificate<\/h1>/)
 assert.doesNotMatch(payload.body,/<img/)
 assert.match(payload.body,/&lt;img/)
 template.body='<p>Changed</p>'
 assert.match(payload.body,/Certificate/)
 await assert.rejects(()=>lib.prepareData('c','TEMPLATE',{body:'<p> </p><script>bad</script>',bodyFormat:'HTML'},null,null,'ACTIVE',null),/10 characters/)
})

test('paper sizes use exact print dimensions with safe legacy defaults',()=>{
 const {readPaperSize,documentPageCss}=loader()('src/lib/hr-center/document-paper.ts')
 assert.equal(readPaperSize(undefined),'A4')
 assert.equal(readPaperSize('invalid; color:red'),'A4')
 assert.match(documentPageCss('LONG'),/size:215.9mm 330.2mm/)
 assert.match(documentPageCss('LEGAL'),/size:215.9mm 355.6mm/)
 assert.match(documentPageCss('LETTER'),/size:215.9mm 279.4mm/)
 assert.match(documentPageCss('A5'),/size:148mm 210mm/)
 assert.equal(policy.payloadSchemas.TEMPLATE.safeParse({body:'Example document',paperSize:'invalid'}).success,false)
})
test('issued documents retain selected template paper size after later changes',async()=>{
 const template={body:'Hello {{employee_name}}',paperSize:'LONG'}
 const employee={firstName:'Ana',lastName:'Reyes',employeeNo:'E1',hireDate:new Date('2020-01-01'),employmentStatus:'REGULAR'}
 const lib=loader({'@/lib/prisma':{prisma:{employee:{findFirst:async()=>employee},hrOperation:{findFirst:async()=>({version:1,title:'COE',data:template})},company:{findUniqueOrThrow:async()=>({name:'Company'})}}}})('src/lib/hr-center/service.ts')
 const issue=()=>lib.prepareData('c','DOCUMENT',{templateId:'t',purpose:'Bank',signatory:'HR'},'e',null,'ISSUED',null)
 const first=(await issue()).payload
 template.paperSize='LETTER'
 const second=(await issue()).payload
 assert.equal(first.paperSize,'LONG');assert.equal(second.paperSize,'LETTER')
 assert.notEqual(JSON.stringify(first),JSON.stringify(second))
})
for(const [allowed,found,version,expected] of [[true,true,1,200],[false,true,1,403],[true,false,1,404],[true,true,2,409]])test(`template deletion permission ${allowed}, found ${found}, version ${version}`,async()=>{
 let removed=0;const record={id:'template',title:'Notice',version:1};const tx={$queryRaw:async()=>[],hrOperation:{findFirst:async({where})=>{assert.deepEqual(where,{id:'template',companyId:'company',kind:'TEMPLATE'});return found?record:null},delete:async({where})=>{assert.equal(where.id,'template');removed++;return record}}};
 const {DELETE}=loader({'@/lib/hr-center/access':{hrAccess:async()=>({ctx:{companyId:'company',userId:'admin'},granted:allowed?['documents:manage']:[]})},'@/lib/prisma':{prisma:{$transaction:async f=>f(tx)}},'@/lib/audit':{logAudit:async()=>{}},'@/lib/salary/service':{}})('src/app/api/hr-center/[id]/route.ts');const result=await DELETE({json:async()=>({version})},{params:Promise.resolve({id:'template'})});assert.equal(result.status,expected);assert.equal(removed,expected===200?1:0)
});
