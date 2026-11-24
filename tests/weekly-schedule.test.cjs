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

const { parseScheduleWeek, scheduleWeekStart } = loader()('src/lib/attendance/schedule-week.ts')
test('weeks start Monday, including Sunday and year boundaries', () => {
  assert.equal(parseScheduleWeek('2026-11-11').toISOString().slice(0,10),'2026-11-09')
  assert.equal(parseScheduleWeek('2026-11-15').toISOString().slice(0,10),'2026-11-09')
  assert.equal(scheduleWeekStart(new Date('2027-01-01')).toISOString().slice(0,10),'2026-12-28')
  for(const date of ['2026-02-30','2026-13-01','bad','2026-1-1','1900-01-01']) assert.equal(parseScheduleWeek(date),null)
})
test('weekly API returns seven days, scoped assignments and approved leave, while retaining read-only access', async () => {
  const { GET }=loader({
    '@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c'},error:null})},
    '@/lib/portal-employee':{resolvePortalEmployeeId:async()=> 'e'},
    '@/lib/prisma':{prisma:{employee:{findFirst:async({where})=>{assert.deepEqual(where,{id:'e',companyId:'c',isActive:true});return{id:'e',workSchedule:{name:'Office',timeIn:'08:00',timeOut:'17:00',workDays:[1,2,3,4,5]}}}},
      employeeShiftAssignment:{findMany:async({where})=>{assert.equal(where.employeeId,'e');assert.equal(where.companyId,'c');assert.equal(where.date.gte.toISOString().slice(0,10),'2026-11-09');assert.equal(where.date.lte.toISOString().slice(0,10),'2026-11-15');return[]}},
      leaveRequest:{findMany:async({where})=>{assert.equal(where.employeeId,'e');assert.equal(where.status,'APPROVED');return[{startDate:new Date('2026-11-11'),endDate:new Date('2026-11-11'),isHalfDay:true,halfDayPeriod:'AM',leaveType:{name:'Annual'}}]}}
    }}
  })('src/app/api/employees/me/schedule/route.ts')
  const response=await GET({nextUrl:new URL('https://example.com?week=2026-11-11')})
  assert.equal(response.status,200)
  const data=await response.json();assert.equal(data.days.length,7);assert.equal(data.readOnly,true)
  assert.equal(data.days[2].leaves[0].period,'AM');assert.equal(data.days[1].leaves.length,0)
  assert.equal(data.days[6].shifts[0].isRestDay,true)
  assert.equal((await GET({nextUrl:new URL('https://example.com?week=2026-02-30')})).status,400)
})
test('weekly API requires authentication before loading employee data',async()=>{
 const {GET}=loader({'@/lib/api-auth':{requireAuth:async()=>({error:new Response('Unauthorized',{status:401})})},'@/lib/prisma':{prisma:{}}})('src/app/api/employees/me/schedule/route.ts')
 assert.equal((await GET({})).status,401)
})





