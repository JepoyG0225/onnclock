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






const pay=loader()('src/lib/payroll/rest-day-pay.ts').restDayPay
const day=new Date('2026-11-09T00:00Z'),at=(t,d='09')=>new Date(`2026-11-${d}T${t}:00+08:00`)
const session={id:'s',date:day,timeIn:at('08:00'),timeOut:at('17:00'),breakIn:at('12:00'),breakOut:at('13:00')}
test('ordinary rest-day first eight hours and statutory OT',()=>{assert.equal(pay([session],()=>100)[0].total,1040);const row=pay([{...session,timeOut:at('18:00')}],()=>100)[0];assert.equal(row.total,1209);assert.equal(row.overtimePay,169)})
test('rest-day holiday combinations',()=>{assert.equal(pay([{...session,holidayType:'SPECIAL_NON_WORKING'}],()=>100)[0].total,1200);assert.equal(pay([{...session,holidayType:'REGULAR',timeOut:at('18:00')}],()=>100)[0].total,2418)})
test('partial day actual hours and cumulative daily OT across sessions',()=>{const a={...session,timeOut:at('12:00'),breakIn:null,breakOut:null},b={...session,id:'s2',timeIn:at('13:00'),timeOut:at('18:00'),breakIn:null,breakOut:null};const rows=pay([a,b],()=>100,0);assert.equal(rows[0].total,520);assert.equal(rows[1].overtimePay,169);assert.equal(rows[1].regularHours,4)})
test('overnight rest day includes 10% night differential on applicable premium',()=>{const row=pay([{...session,timeIn:at('22:00'),timeOut:at('07:00','10'),breakIn:at('02:00','10'),breakOut:at('03:00','10')}],()=>100)[0];assert.equal(row.nightPay,91);assert.equal(row.total,1131)})
test('invalid durations are held for review and rates follow the worked date',()=>{assert.throws(()=>pay([{...session,timeOut:at('17:00','11')}],()=>100));assert.equal(pay([session],d=>d==='2026-11-09'?200:100)[0].total,2080)})
test('only HR or company admin may approve rest-day shifts, not the requester',async()=>{
 for(const role of ['EMPLOYEE','PAYROLL_OFFICER']){const api=loader({'@/lib/prisma':{prisma:{}},'@/lib/api-auth':{requireAuth:async()=>({ctx:{role}})},'@/lib/audit':{},'@/lib/notifications':{}})('src/app/api/attendance/rest-day-requests/route.ts');assert.equal((await api.POST({})).status,403)}
 const api=loader({'@/lib/prisma':{prisma:{dTRRecord:{findFirst:async()=>({employee:{userId:'me'}})}}},'@/lib/api-auth':{requireAuth:async()=>({ctx:{role:'HR_MANAGER',userId:'me',companyId:'c'}})},'@/lib/audit':{},'@/lib/notifications':{}})('src/app/api/attendance/rest-day-requests/route.ts');assert.equal((await api.POST({json:async()=>({id:'d',action:'APPROVED'})})).status,403)
})

test('rest-day clock-in is allowed but a missing flexible schedule remains blocked',async()=>{
 let assignments=[]
 const lib=loader({'@/lib/prisma':{prisma:{employeeShiftAssignment:{findMany:async()=>assignments}}},'@/lib/feature-gates':{},'@/lib/attendance/punch-target':{},'@/lib/notifications':{},'@/lib/date-manila':{},'@/lib/attendance/schedule-location':{},'@/lib/attendance/location-policy':{}})('src/lib/attendance/clock-in.ts')
 const input={companyId:'c',employeeId:'e',workScheduleId:'fixed',fixedWorkDays:[1,2,3,4,5],manilaDate:day,dateStr:'2026-11-09',dayOfWeek:0}
 assert.equal((await lib.canAttendToday(input)).restDay,true)
 assignments=[{isRestDay:true}];assert.equal((await lib.canAttendToday({...input,dayOfWeek:1})).allowed,true)
 assignments=[];assert.equal((await lib.canAttendToday({...input,workScheduleId:null})).allowed,false)
 assignments=[{isRestDay:false,scheduleId:'assigned'}];assert.equal((await lib.canAttendToday(input)).restDay,undefined)
})

test('unresolved or newly approved rest-day shifts hold an already-computed payroll',async()=>{
 let row={id:'shift',employeeId:'e',timeOut:new Date(),restDayApproval:'PENDING'},basis={restDayBreakdown:[]}
 const lib=loader({'@/lib/prisma':{prisma:{payslip:{findMany:async()=>[{employeeId:'e',calculationBasis:basis}]},dTRRecord:{findMany:async()=>[row]}}}})('src/lib/payroll/rest-day-review.ts')
 assert.ok(await lib.restDayPayrollIssue('r','c',day,day));row.restDayApproval='APPROVED';assert.ok(await lib.restDayPayrollIssue('r','c',day,day));basis.restDayBreakdown=[{attendanceId:'shift'}];assert.equal(await lib.restDayPayrollIssue('r','c',day,day),null)
})
