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




const status=loader()('src/lib/attendance/review.ts').attendanceReviewStatus
const end=loader()('src/lib/attendance/shift-end.ts').scheduledShiftEnd
const day=new Date('2026-10-28T00:00:00Z')
test('unfinished sessions never require review and Track DTR off bypasses review',()=>{
 assert.equal(status({timeIn:'in',timeOut:null,employee:{trackTime:true}}),'IN_PROGRESS')
 assert.equal(status({timeIn:'in',timeOut:'out',employee:{trackTime:false}}),'NOT_REQUIRED')
 assert.equal(status({timeIn:'in',timeOut:'out',employee:{trackTime:true}}),'PENDING')
 assert.equal(status({timeIn:'in',timeOut:'out',employee:{trackTime:true},approvedBy:'a'}),'APPROVED')
})
test('scheduled clock-out uses Philippine time for daytime and overnight shifts',()=>{
 assert.equal(end(day,new Date('2026-10-28T00:00:00Z'),'08:00','17:00').toISOString(),'2026-10-28T09:00:00.000Z')
 assert.equal(end(day,new Date('2026-10-28T14:00:00Z'),'22:00','06:00').toISOString(),'2026-10-28T22:00:00.000Z')
 // A midnight punch stored on its local calendar date belongs to the preceding overnight shift.
 assert.equal(end(day,new Date('2026-10-27T17:00:00Z'),'22:00','06:00').toISOString(),'2026-10-27T22:00:00.000Z')
})
test('missing, invalid, ambiguous and already-ended schedules are not auto-closed',()=>{
 const punch=new Date('2026-10-28T10:00:00Z')
 for(const times of [[null,null],['08:00',null],['25:00','17:00'],['08:00','08:00'],['08:00','17:00']])assert.equal(end(day,punch,...times),null)
})
function approval(record,permission=true){const writes=[];const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{userId:'reviewer',companyId:'company',role:'HR_MANAGER'}}),resolveCompanyIdForRequest:ctx=>ctx.companyId},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>permission},'@/lib/prisma':{prisma:{dTRRecord:{findFirst:async()=>record,update:async q=>{writes.push(q);return {...record,...q.data}}}}},'@/lib/audit':{logAudit:async()=>{}},'@/lib/overtime-requests':{isOvertimeEnabledForCompany:async()=>false}})('src/app/api/dtr/[id]/approve/route.ts');return {writes,call:action=>api.POST({json:async()=>({action})},{params:Promise.resolve({id:'r'})})}}
const completed=()=>({id:'r',employeeId:'employee',timeIn:new Date('2026-10-28T00:00Z'),timeOut:new Date('2026-10-28T09:00Z'),date:day,remarks:'Prior note',employee:{trackTime:true}})
test('direct approval API rejects active and untracked sessions without writes',async()=>{
 for(const r of [{...completed(),timeOut:null},{...completed(),employee:{trackTime:false}}]){const s=approval(r);assert.equal((await s.call('APPROVED')).status,409);assert.equal(s.writes.length,0)}
 const noPermission=approval(completed(),false);assert.equal((await noPermission.call('APPROVED')).status,403)
})
test('completed-session rejection is explicit and update rechecks clock-out',async()=>{
 const s=approval(completed());assert.equal((await s.call('REJECTED')).status,200);assert.equal(s.writes[0].data.remarks,'REJECTED');assert.deepEqual(s.writes[0].where.timeOut,{not:null})
 const invalid=approval(completed());assert.equal((await invalid.call('OTHER')).status,422);assert.equal(invalid.writes.length,0)
})
function audience({role='HR_MANAGER',userId='viewer',workflows=[],configs=[],manager='manager'}={}){
 const queries=[];const db={approvalWorkflow:{findMany:async q=>{queries.push(q);return workflows}},approverConfig:{findMany:async q=>{queries.push(q);return configs}},employee:{findUnique:async()=>({manager:{userId:manager}})},userCompany:{findMany:async()=>[]}}
 return {queries,create:()=>loader({'@/lib/prisma':{prisma:db}})('src/lib/approvals/audience.ts').requestAudience({companyId:'company',userId,role})}
}
test('HR role alone does not receive requests; configured module and current level are required',async()=>{
 const s=audience({configs:[{type:'LEAVE',level:2,userId:'viewer'}]}),can=await s.create()
 assert.equal(await can('LEAVE',{approvalLevel:0}),false);assert.equal(await can('LEAVE',{approvalLevel:1}),true);assert.equal(await can('OVERTIME',{approvalLevel:1}),false);assert.equal(s.queries[0].where.companyId,'company')
})
test('company administrators see company requests without requiring a configured chain',async()=>{const s=audience({role:'COMPANY_ADMIN'}),can=await s.create();assert.equal(await can('ATTENDANCE_REVIEW',{}),true);assert.equal(s.queries.length,0)})
const step=(id,userId,conditions=null)=>({id,order:1,stepType:'APPROVAL',conditions,approverType:'SPECIFIC_USER',approverUserId:userId})
test('department workflow overrides the default and conditional amounts use real request fields',async()=>{
 const s=audience({workflows:[{id:'default',companyId:'company',type:'CASH_ADVANCE',departmentId:null,steps:[step('s','viewer')]},{id:'dept',companyId:'company',type:'CASH_ADVANCE',departmentId:'dept',steps:[step('conditional','other',{match:'ALL',rules:[{field:'amount',op:'gt',value:1000}]}),step('review','viewer')]}]}),can=await s.create()
 assert.equal(await can('CASH_ADVANCE',{amountRequested:2000,employee:{departmentId:'dept'}}),false)
 assert.equal(await can('CASH_ADVANCE',{amountRequested:500,employee:{departmentId:'dept'}}),true)
 assert.equal(await can('CASH_ADVANCE',{amountRequested:2000,employee:{departmentId:'another'}}),true)
})
test('Reports-To approvers are resolved for the requester rather than every department head',async()=>{
 const s=audience({userId:'manager',workflows:[{id:'w',companyId:'company',type:'LEAVE',departmentId:null,steps:[{...step('manager',null),approverType:'DEPARTMENT_HEAD'}]}]}),can=await s.create()
 assert.equal(await can('LEAVE',{employeeId:'requester',employee:{departmentId:'d'}}),true)
})
function auto({enabled=true,from='2026-10-28T00:00Z',open=true,manualWins=false,timed=true}={}){
 let isOpen=open;const writes=[],audits=[],sync=[]
 const company={id:'company',shiftEndClockoutEnabledAt:new Date(from),defaultBreakMinutes:60}
 const record={id:'r',employeeId:'employee',date:day,timeIn:new Date('2026-10-28T00:00Z'),timeOut:null,breakIn:null,breakOut:null,remarks:null,employee:{workScheduleId:'w',workSchedule:{workDays:[1,2,3,4,5]}}}
 const tx={$queryRaw:async()=>{},company:{findUnique:async()=>({...company,shiftEndClockoutEnabled:enabled})},dTRRecord:{updateMany:async q=>{writes.push(q);if(manualWins)return {count:0};isOpen=false;return {count:1}}},auditLog:{create:async q=>audits.push(q)}}
 const db={company:{findMany:async()=>[company]},dTRRecord:{findMany:async q=>{assert.equal(q.where.employee.trackTime,true);return isOpen?[record]:[]}},employeeShiftAssignment:{count:async()=>0},$transaction:async fn=>fn(tx)}
 const lib=loader({'@/lib/prisma':{prisma:db},'@/lib/timesheet/compute':{getCompanyNightDiffWindow:async()=>({startMins:1320,endMins:360,includesBreak:false}),resolveShiftForDtr:async()=>({scheduleTimeIn:timed?'08:00':null,scheduleTimeOut:timed?'17:00':null,allowedBreakMinutes:60,plannedRegularMinutes:540,matchedAssignment:true}),computeHours:()=>({regularHours:8,overtimeHours:0,nightDiffHours:0}),computeLateAndUndertime:()=>({lateMinutes:0,undertimeMinutes:0})},'@/lib/overtime-requests':{syncAutoOvertimeRequest:async q=>sync.push(q)}})('src/lib/attendance/auto-clockout.ts')
 return {writes,audits,sync,run:()=>lib.closeScheduledShifts(new Date('2026-10-28T09:01Z'))}
}
test('automatic clock-out stamps the scheduled time, is auditable and idempotent',async()=>{
 const s=auto();assert.equal((await s.run()).closed,1);assert.equal(s.writes[0].data.timeOut.toISOString(),'2026-10-28T09:00:00.000Z');assert.equal(s.writes[0].where.timeOut,null);assert.equal(s.audits[0].data.userId,'SYSTEM');assert.equal((await s.run()).closed,0);assert.equal(s.sync.length,1)
})
test('auto clock-out skips disabled, historical and untimed shifts and respects concurrent manual punches',async()=>{
 for(const settings of [{enabled:false},{from:'2026-10-28T10:00Z'},{timed:false},{manualWins:true}]){const s=auto(settings);assert.equal((await s.run()).closed,0);assert.equal(s.audits.length,0);assert.equal(s.sync.length,0)}
})
test('old self-scheduling clients cannot mutate assignments',async()=>{
 const overrides={'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c',userId:'u'}})},'@/lib/prisma':{prisma:{}},'@/lib/portal-employee':{resolvePortalEmployeeId:async()=>null}}
 for(const file of ['src/app/api/schedules/self-service/route.ts','src/app/api/employees/me/schedule/route.ts']){const api=loader(overrides)(file);assert.equal((await api.PATCH()).status,410)}
})
