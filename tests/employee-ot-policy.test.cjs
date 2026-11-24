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






const {eligibleOtHours}=loader()('src/lib/payroll/ot-policy.ts')
const date=new Date('2026-11-09T00:00:00Z')
const at=(time,day='09')=>new Date(`2026-11-${day}T${time}:00+08:00`)
const shift={scheduleTimeIn:'08:00',scheduleTimeOut:'17:00',allowedBreakMinutes:60,plannedRegularMinutes:540}
const session={date,timeIn:at('07:00'),timeOut:at('18:00'),breakIn:at('12:00'),breakOut:at('12:30')}
test('separate early arrivals/short breaks from post-shift OT',()=>{
 assert.equal(eligibleOtHours(session,shift,{}),2.5)
 assert.equal(eligibleOtHours(session,shift,{disableEarlyInOt:true}),1)
 assert.equal(eligibleOtHours(session,shift,{disableBeyondScheduleOt:true}),1.5)
 assert.equal(eligibleOtHours(session,shift,{disableEarlyInOt:true,disableBeyondScheduleOt:true}),0)
})
test('normal break, no break capture, late arrivals and incomplete sessions',()=>{
 assert.equal(eligibleOtHours({...session,breakOut:at('13:00')},shift,{disableEarlyInOt:true}),1)
 assert.equal(eligibleOtHours({...session,breakIn:null,breakOut:null},shift,{disableEarlyInOt:true}),1)
 assert.equal(eligibleOtHours({...session,timeIn:at('09:00'),breakOut:at('13:00')},shift,{disableEarlyInOt:true}),0)
 assert.equal(eligibleOtHours({...session,timeOut:null},shift,{disableEarlyInOt:true}),0)
})
test('overnight shifts and missing schedules',()=>{
 const night={...session,timeIn:at('21:00'),timeOut:at('08:00','10'),breakIn:at('02:00','10'),breakOut:at('02:30','10')}
 const ns={...shift,scheduleTimeIn:'22:00',scheduleTimeOut:'07:00'}
 assert.equal(eligibleOtHours(night,ns,{disableEarlyInOt:true}),1)
 assert.equal(eligibleOtHours(night,ns,{disableBeyondScheduleOt:true}),1.5)
 assert.equal(eligibleOtHours(session,{...shift,scheduleTimeOut:null},{disableEarlyInOt:true}),0)
})
test('approved OT is capped without increasing or deleting approved requests',async()=>{
 const employee={id:'e',disableEarlyInOt:true,disableBeyondScheduleOt:false,workSchedule:null,workScheduleId:null}
 const mock={overtimeRequest:{findMany:async()=>[{employeeId:'e',date,hours:3}]},employee:{findMany:async()=>[employee]},dTRRecord:{findMany:async()=>[session]}}
 const api=loader({'@/lib/prisma':{prisma:mock},'@/lib/timesheet/compute':{resolveShiftForDtr:async()=>shift,normalizeSingleShiftTimeOut:(a,b)=>b}})('src/lib/overtime-requests.ts')
 const map=await api.getApprovedOtHoursMap({companyId:'c',dateFrom:date,dateTo:date})
 assert.equal([...map.values()][0],1)
 employee.disableEarlyInOt=false;employee.disableBeyondScheduleOt=true
 assert.equal([...(await api.getApprovedOtHoursMap({companyId:'c',dateFrom:date,dateTo:date})).values()][0],1.5)
})

test('timesheet pending OT respects employee exclusions, including old stored hours', async()=>{
 const employee={disableEarlyInOt:true,disableBeyondScheduleOt:true,overtimePayOverride:false,workSchedule:null,workScheduleId:null}
 const record={...session,employeeId:'e',employee,regularHours:7.98,overtimeHours:0.01,_count:{screenCaptures:0}}
 const api=loader({
  '@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c'}}),resolveCompanyIdForRequest:()=> 'c'},
  '@/lib/attendance/activities':{activityScope:async()=>({companyId:'c'})},
  '@/lib/prisma':{prisma:{dTRRecord:{findMany:async()=>[record],count:async()=>1},employeeShiftAssignment:{findMany:async()=>[]}}},
  '@/lib/overtime-requests':{buildOtMapKey:()=> 'e',getApprovedOtHoursMap:async()=>new Map(),isOvertimeEnabledForCompany:async()=>true},
  '@/lib/timesheet/dtr-upsert':{},
  '@/lib/timesheet/compute':{resolveShiftForDtr:async()=>shift,normalizeSingleShiftTimeOut:(a,b)=>b},
 })('src/app/api/dtr/route.ts')
 const read=async()=> (await (await api.GET({url:'https://example.com/api/dtr'})).json()).records[0]
 assert.equal((await read()).pendingOvertimeHours,0)
 assert.equal((await read()).overtimeHours,0)
 record.overtimeHours=3
 employee.disableBeyondScheduleOt=false
 assert.equal((await read()).pendingOvertimeHours,1)
 employee.disableEarlyInOt=false;employee.disableBeyondScheduleOt=true
 assert.equal((await read()).pendingOvertimeHours,1.5)
 employee.disableBeyondScheduleOt=false
 assert.equal((await read()).pendingOvertimeHours,3)
})

test('large timesheet pages batch schedule lookups and keep per-employee assignments', async()=>{
 let lookups=0
 const records=Array.from({length:200},(_,i)=>({...session,employeeId:`e${i}`,employee:{disableEarlyInOt:true,disableBeyondScheduleOt:false,workSchedule:null,workScheduleId:null},regularHours:8,overtimeHours:3,_count:{screenCaptures:0}}))
 const api=loader({
  '@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c'}}),resolveCompanyIdForRequest:()=> 'c'},
  '@/lib/attendance/activities':{activityScope:async()=>({companyId:'c'})},
  '@/lib/prisma':{prisma:{dTRRecord:{findMany:async()=>records,count:async()=>200},employeeShiftAssignment:{findMany:async()=>{lookups++;return records.map(r=>({employeeId:r.employeeId,date,timeIn:'08:00',timeOut:'17:00',schedule:null}))}}}},
  '@/lib/overtime-requests':{buildOtMapKey:(id,d)=>`${id}:${d.toISOString()}`,getApprovedOtHoursMap:async()=>new Map(),isOvertimeEnabledForCompany:async()=>true},
  '@/lib/timesheet/dtr-upsert':{},
  '@/lib/timesheet/compute':{resolveShiftForDtr:async p=>{assert.equal(p.assignments.length,1);assert.equal(p.assignments[0].employeeId,p.employeeId);return shift},normalizeSingleShiftTimeOut:(a,b)=>b},
 })('src/app/api/dtr/route.ts')
 const response=await api.GET({url:'https://example.com/api/dtr?limit=2000'})
 const data=await response.json()
 assert.equal(data.records.length,200)
 assert.equal(lookups,1)
 assert.ok(data.records.every(r=>r.pendingOvertimeHours===1))
})

test('both exclusions disable automatic OT even when company OT and employee override are enabled',async()=>{
 const employee={overtimePayOverride:true,disableEarlyInOt:true,disableBeyondScheduleOt:true}
 const api=loader({'@/lib/prisma':{prisma:{payrollCycleConfig:{findUnique:async()=>({enableOvertime:true})},employee:{findFirst:async()=>employee}}}})('src/lib/overtime-requests.ts')
 assert.equal(await api.isOvertimeEnabledForEmployee('c','e'),false)
 employee.disableBeyondScheduleOt=false
 assert.equal(await api.isOvertimeEnabledForEmployee('c','e'),true)
})
test('auto-approval writes exclude fully disabled employees',async()=>{
 let where
 const api=loader({'@/lib/prisma':{prisma:{overtimeRequest:{updateMany:async p=>{where=p.where;return {count:0}}}}}})('src/lib/overtime-requests.ts')
 await api.approveAutoOtForDtr({companyId:'c',employeeId:'e',date,approvedById:'u'})
 assert.deepEqual(where.employee,{NOT:{disableEarlyInOt:true,disableBeyondScheduleOt:true}})
 const page=fs.readFileSync('src/app/(dashboard)/payroll/[runId]/page.tsx','utf8')
 assert.match(page,/employee: OT_ELIGIBLE_EMPLOYEE, status: 'PENDING'/)
})
