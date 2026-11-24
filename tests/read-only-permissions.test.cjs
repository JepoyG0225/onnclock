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




const policy=loader()('src/lib/auth/mutation-permissions.ts')
const permissions=loader()('src/lib/auth/permissions.ts')
const page=loader()('src/lib/auth/page-access.ts')
test('module reads never grant mutation permissions',()=>{
 for(const [url,method,required]of [
 ['/api/employees/e','PATCH','employees:write'],['/api/employees/e','DELETE','employees:delete'],
 ['/api/dtr/d/approve','POST','dtr:approve'],['/api/dtr/d','PATCH','dtr:write'],
 ['/api/payroll/run/compute','POST','payroll:write'],['/api/payroll/run/approve','POST','payroll:approve'],
 ['/api/payroll/run/lock','POST','payroll:lock'],['/api/leaves/l/approve','POST','leaves:approve'],
 ['/api/loans/l','PATCH','loans:write'],['/api/settings','PATCH','settings:write'],
 ['/api/tasks','POST','tasks:write'],['/api/benefits/enrollments/e','PATCH','benefits:manage'],
 ['/api/attendance/rest-day-requests','POST','dtr:approve'],['/api/assets/a/assign','POST','assets:manage']]){
  assert.ok(policy.mutationPermissions(url,method).includes(required),url)
  assert.ok(policy.mutationPermissions(url,method).every(p=>!p.endsWith(':read')),url)
  assert.equal(policy.mutationPermissions(url,'GET'),null)
 }
 assert.equal(policy.mutationPermissions('/api/employees/me','PATCH'),null)
 assert.equal(policy.mutationPermissions('/api/attendance/clock-in','POST'),null)
 assert.equal(page.canAccessPath('/employees/e/edit',['employees:read']),false)
 assert.equal(page.canAccessPath('/employees/e',['employees:read']),true)
})
test('proxy blocks restricted HR roles and bearer identities before handlers execute',async()=>{
 let granted=['employees:read','payroll:read','dtr:read']
 const proxy=loader({'@/lib/auth':{auth:handler=>handler},'@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>granted},'@/lib/desktop-token':{verifyDesktopToken:token=>token==='valid'?{userId:'u',companyId:'c',role:'HR_MANAGER'}:null}})('src/proxy.ts').default
 const req=(path,method='POST',bearer)=>{const url=new URL('https://onclockph.com'+path);url.clone=()=>new URL(url);return{auth:{user:{id:'u',companyId:'c',role:'HR_MANAGER'}},nextUrl:url,headers:new Headers({host:'onclockph.com',...(bearer?{authorization:'Bearer '+bearer}:{})}),cookies:{get:()=>undefined},method}}
 assert.equal((await proxy(req('/api/payroll/run/approve'))).status,403)
 assert.equal((await proxy(req('/api/employees/e','PATCH','valid'))).status,403)
 assert.equal((await proxy(req('/api/employees/e','PATCH','invalid'))).status,401)
 assert.equal((await proxy(req('/api/employees/e','GET'))).status,200)
 granted=['employees:write']
 assert.equal((await proxy(req('/api/employees/e','PATCH'))).status,200)
})
test('permission lookup failure does not restore broad built-in permissions',async()=>{
 const get=loader({'@/lib/prisma':{prisma:{$queryRawUnsafe:async()=>{throw new Error('Database unavailable')}}}})('src/lib/auth/effective-permissions.ts').getEffectivePermissions
 await assert.rejects(()=>get('HR_MANAGER','c','u'),/Database unavailable/)
 const getOverride=loader({'@/lib/prisma':{prisma:{$queryRawUnsafe:async()=>[],companyRolePermission:{findUnique:async()=>{throw new Error('Unavailable')}}}}})('src/lib/auth/effective-permissions.ts').getEffectivePermissions
 await assert.rejects(()=>getOverride('HR_MANAGER','c','u'),/Unavailable/)
})
test('task readers cannot edit even their own tasks or inherit HR role management',async()=>{
 const lib=loader({'@/lib/prisma':{prisma:{employee:{findFirst:async()=>({id:'e'})}}}})('src/lib/tasks/access.ts')
 const actor=await lib.resolveTaskActor({userId:'u',companyId:'c',role:'HR_MANAGER'},'c',false,false)
 assert.equal(actor.canManage,false)
 assert.equal(lib.canEditTask(actor,{createdByUserId:'u',assignees:[{employeeId:'e'}]}),false)
 assert.equal(lib.canEditTask({...actor,canWrite:true},{createdByUserId:'u',assignees:[]}),true)
 assert.ok(permissions.PAGE_PERMISSIONS.some(g=>g.items?.some?.(i=>i.permission==='tasks:write'))||JSON.stringify(permissions.PAGE_PERMISSIONS).includes('tasks:write'))
})
test('read-only action buttons are hidden without hiding their view siblings',()=>{
 const {PermissionGate}=loader({'./PermissionsProvider':{usePermissions:()=>['dtr:read']}})('src/components/auth/PermissionGate.tsx')
 assert.equal(renderToStaticMarkup(React.createElement(PermissionGate,{permission:'dtr:approve'},'Approve')),'')
 assert.equal(renderToStaticMarkup(React.createElement(PermissionGate,{permission:'dtr:read'},'View')),'View')
})

test('company header prints as escaped content in the issued document',async()=>{
 const {GET}=loader({'@/lib/hr-center/access':{hrAccess:async()=>({ctx:{companyId:'c'},kinds:['DOCUMENT']})},'@/lib/prisma':{prisma:{hrOperation:{findFirst:async()=>({id:'d',title:'COE',createdAt:new Date(),data:{body:'Hello Ana',header:{enabled:true,text:'Company <name>',image:'data:image/png;base64,AAAA',alignment:'center'}}})}}}})('src/app/api/hr-center/[id]/print/route.ts')
 const response=await GET(null,{params:Promise.resolve({id:'d'})});const html=await response.text()
 assert.match(html,/Company &lt;name&gt;/);assert.ok(html.indexOf('<header')<html.indexOf('<article'))
 assert.match(response.headers.get('content-security-policy'),/img-src data:/)
})

test('personal requests and submissions reach ownership checks without admin permissions',async()=>{
 const proxy=loader({'@/lib/auth':{auth:handler=>handler},'@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>['leaves:read','dtr:read','tasks:read','expenses:read','budget:read','loans:read']},'@/lib/desktop-token':{verifyDesktopToken:()=>null}})('src/proxy.ts').default
 for(const [path,method] of [['leaves','POST'],['loans','POST'],['cash-advance','POST'],['expenses','POST'],['expenses/e','PATCH'],['expenses/e/receipt','POST'],['budget-requisitions','POST'],['time-corrections','POST'],['time-corrections/c','DELETE'],['performance-reviews/r','PATCH'],['tasks/t/checklist','PATCH'],['tasks/t/comments','POST'],['attendance/clock-in','POST'],['attendance/activities','POST'],['learning/courses/c/player','POST']]){
  const url=new URL('https://onclockph.com/api/'+path);url.clone=()=>new URL(url)
  const r=await proxy({auth:{user:{id:'u',companyId:'c',role:'EMPLOYEE'}},nextUrl:url,headers:new Headers({host:'onclockph.com'}),cookies:{get:()=>undefined},method})
  assert.equal(r.status,200,path)
 }
})
test('employees with legacy read permissions can work only on their assigned/authored tasks',async()=>{
 const lib=loader({'@/lib/prisma':{prisma:{employee:{findFirst:async()=>({id:'e'})}}}})('src/lib/tasks/access.ts')
 const actor=await lib.resolveTaskActor({userId:'u',companyId:'c',role:'EMPLOYEE'},'c',false,false)
 assert.equal(lib.canEditTask(actor,{createdByUserId:'other',assignees:[{employeeId:'e'}]}),true)
 assert.equal(lib.canEditTask(actor,{createdByUserId:'other',assignees:[{employeeId:'other'}]}),false)
})
test('leave submission creates own pending request despite read-only admin permissions',async()=>{
 let created=null
 const balance={id:'b',entitled:{toNumber:()=>5},carriedOver:{toNumber:()=>0},used:{toNumber:()=>0},pending:{toNumber:()=>0},encashed:{toNumber:()=>0}}
 const db={employeeShiftAssignment:{findMany:async()=>[]},employee:{findFirst:async args=>{assert.equal(args.where.companyId,'c');return{id:'e'}},findUnique:async()=>({firstName:'Ana',lastName:'Cruz'})},leaveType:{findFirst:async()=>({id:'l'}),findUnique:async()=>({name:'Leave'})},leaveBalance:{findFirst:async()=>balance},$transaction:async fn=>fn({$queryRaw:async()=>[],leaveBalance:{findUniqueOrThrow:async()=>({entitled:5,carriedOver:0,used:0,pending:0,encashed:0}),updateMany:async()=>({count:1})},leaveRequest:{create:async({data})=>{created=data;return{id:'r',...data}}}})}
 const {POST}=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{userId:'u',companyId:'c',role:'EMPLOYEE'},error:null})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>false},'@/lib/prisma':{prisma:db},'@/lib/audit':{logAudit:async()=>{}},'@/lib/approvals/engine':{resolveWorkflow:async()=>null},'@/lib/notifications':{},'@/lib/approvals/notify':{}})('src/app/api/leaves/route.ts')
 const body={leaveTypeId:'l',startDate:'2026-11-10',endDate:'2026-11-10',totalDays:1,reason:'Personal'}
 assert.equal((await POST({json:async()=>body})).status,201)
 assert.equal(created.employeeId,'e');assert.equal(created.status,'PENDING')
 created=null
 assert.equal((await POST({json:async()=>({...body,employeeId:'other'})})).status,403)
 assert.equal(created,null)
})

test('employee loan application remains pending and cannot target another employee',async()=>{
 let saved
 const {POST}=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{userId:'u',companyId:'c',role:'EMPLOYEE'},error:null})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>false},'@/lib/prisma':{prisma:{employee:{findFirst:async({where})=>{assert.equal(where.companyId,'c');return{id:'e'}}},employeeLoan:{create:async({data})=>{saved=data;return{id:'loan',...data}}}}}})('src/app/api/loans/route.ts')
 const response=await POST({json:async()=>({employeeId:'other',loanType:'COMPANY_LOAN',amount:1000,monthlyAmortization:500,startDate:'2026-11-10'})})
 assert.equal(response.status,201);assert.equal(saved.employeeId,'e');assert.equal(saved.status,'PENDING')
})
