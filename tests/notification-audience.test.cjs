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






function setup(){
 const members=[{userId:'admin',role:'COMPANY_ADMIN'},{userId:'approver',role:'EMPLOYEE'},{userId:'other',role:'EMPLOYEE'},{userId:'hr',role:'HR_MANAGER'}]
 const db={userCompany:{findMany:async q=>{assert.equal(q.where.companyId,'company');assert.equal(q.where.isActive,true);return members.filter(m=>!q.where.userId||q.where.userId.in.includes(m.userId))}},approvalWorkflow:{findMany:async()=>[]},approverConfig:{findMany:async()=>[{type:'CASH_ADVANCE',level:1,userId:'approver'}]},cashAdvanceRequest:{findFirst:async q=>q.where.companyId==='company'&&q.where.id==='ca'?{id:'ca',employeeId:'requester',approvalLevel:0,employee:{id:'requester',departmentId:'dept'}}:null}}
 const overrides={'@/lib/prisma':{prisma:db},'@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>[]}}
 const lib=loader(overrides)('src/lib/notifications-audience.ts')
 return {db,lib,overrides}
}
const notice={type:'GENERIC',link:'/cash-advance?requestId=ca'}
const ctx=userId=>({companyId:'company',userId,role:userId==='admin'?'COMPANY_ADMIN':userId==='hr'?'HR_MANAGER':'EMPLOYEE',email:''})
test('only company admin and the configured current module approver receive CA alerts',async()=>{
 const {lib}=setup();assert.deepEqual(await lib.requestNotificationRecipients('company',notice),['admin','approver'])
})
test('old broad CA broadcasts are hidden from employees and HR, not reinterpreted as personal updates',async()=>{
 const {lib}=setup();for(const id of ['other','hr','approver'])assert.equal(await (await lib.notificationVisibility(ctx(id)))({type:'GENERIC',link:'/cash-advance'}),false)
 assert.equal(await (await lib.notificationVisibility(ctx('admin')))({type:'GENERIC',link:'/cash-advance'}),true)
})
test('personal request decisions and task messages remain visible',async()=>{
 const {lib}=setup(),can=await lib.notificationVisibility(ctx('other'))
 assert.equal(await can({type:'GENERIC',link:'/portal/loans?tab=cash-advance'}),true)
 assert.equal(await can({type:'GENERIC',link:'/tasks/t'}),true)
})
test('unknown or other-company requests fail closed',async()=>{
 const {lib}=setup();assert.equal(await (await lib.notificationVisibility(ctx('approver')))({...notice,link:'/cash-advance?requestId=unknown'}),false)
})
test('module assignment and level changes revoke old notification access',async()=>{
 const {lib,db}=setup();db.approverConfig.findMany=async()=>[{type:'LEAVE',level:1,userId:'approver'}]
 assert.equal(await (await lib.notificationVisibility(ctx('approver')))(notice),false)
 db.approverConfig.findMany=async()=>[{type:'CASH_ADVANCE',level:2,userId:'approver'}]
 assert.equal(await (await lib.notificationVisibility(ctx('approver')))(notice),false)
})
test('all approval module links including query strings and record paths are classified',()=>{
 const {lib}=setup();for(const link of ['/leaves','/cash-advance?x=1','/budget-requisitions/id','/overtime-requests','/time-corrections','/dtr','/timesheets','/payroll/id'])assert.ok(lib.requestNotificationType({type:'GENERIC',link}))
 assert.equal(lib.requestNotificationType({type:'GENERIC',link:'/portal/leaves'}),null)
})
test('single-recipient writer blocks a misdirected CA notification',async()=>{
 const {db,overrides}=setup();let writes=0;db.notification={create:async()=>{writes++}}
 const api=loader(overrides)('src/lib/notifications.ts')
 await api.createNotification({...notice,companyId:'company',userId:'other',title:'CA'})
 assert.equal(writes,0)
 await api.createNotification({...notice,companyId:'company',userId:'approver',title:'CA'})
 assert.equal(writes,1)
})

test('notification list and unread count exclude old wrongly delivered alerts',async()=>{
 const {db,overrides}=setup()
 db.notification={findMany:async()=>[{id:'bad',type:'GENERIC',link:'/cash-advance',isRead:false},{id:'own',type:'GENERIC',link:'/portal/loans',isRead:false}]}
 const api=loader({...overrides,'@/lib/api-auth':{requireAuth:async()=>({ctx:ctx('other')})}})('src/app/api/notifications/route.ts')
 const response=await api.GET({nextUrl:new URL('https://app.test/api/notifications')})
 const data=await response.json();assert.deepEqual(data.items.map(n=>n.id),['own']);assert.equal(data.unreadCount,1)
})
