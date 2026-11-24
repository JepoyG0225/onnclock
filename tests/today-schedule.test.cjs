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





const {scheduleDays}=loader()('src/lib/attendance/schedule-display.ts')
const {getManilaDateOnly}=loader()('src/lib/date-manila.ts')
const monday=new Date('2026-11-09T00:00:00Z')
const fixed={name:'Office',timeIn:'08:00',timeOut:'17:00',workDays:[1,2,3,4,5],breakMinutes:60,breakEnabled:true}
test('fixed schedule identifies work and rest days without showing rest-day hours',()=>{const days=scheduleDays(monday,[],fixed);assert.equal(days[0].shifts[0].timeIn,'08:00');assert.equal(days[5].shifts[0].isRestDay,true);assert.equal(days[5].shifts[0].timeIn,null)})
test('dated shifts override fixed schedule and are sorted by start time',()=>{const rows=[{date:monday,timeIn:'13:00',timeOut:'16:00',isRestDay:false,schedule:null},{date:monday,timeIn:'08:30',timeOut:'11:00',isRestDay:false,schedule:fixed}];const day=scheduleDays(monday,rows,fixed)[0];assert.deepEqual(day.shifts.map(s=>s.timeIn),['08:30','13:00']);assert.equal(day.shifts[0].breakMinutes,60)})
test('explicit rest-day overrides, overnight shifts and missing schedules remain distinct',()=>{assert.equal(scheduleDays(monday,[{date:monday,timeIn:null,timeOut:null,isRestDay:true,schedule:fixed}],fixed)[0].shifts[0].isRestDay,true);assert.equal(scheduleDays(monday,[],{...fixed,timeIn:'22:00',timeOut:'06:00'})[0].shifts[0].nextDay,true);assert.deepEqual(scheduleDays(monday,[],null)[0].shifts,[])})
test('day boundary follows Philippine time rather than the device timezone',()=>{assert.equal(getManilaDateOnly(new Date('2026-11-09T16:01:00Z')).toISOString().slice(0,10),'2026-11-10')})
test('schedule API accepts desktop auth and scopes employee and assignments to their company',async()=>{
 const req={marker:'desktop'};let passed
 const {GET}=loader({'@/lib/api-auth':{requireAuth:async(_,r)=>{passed=r;return{ctx:{companyId:'c'},error:null}}},'@/lib/portal-employee':{resolvePortalEmployeeId:async()=> 'e'},'@/lib/prisma':{prisma:{employee:{findFirst:async({where})=>{assert.equal(where.companyId,'c');assert.equal(where.id,'e');return{id:'e',workSchedule:fixed}}},employeeShiftAssignment:{findMany:async({where})=>{assert.equal(where.companyId,'c');assert.equal(where.employeeId,'e');return[]}}}}})('src/app/api/employees/me/schedule/route.ts')
 const response=await GET(req);assert.equal(response.status,200);assert.equal(passed,req);assert.equal((await response.json()).days.length,14)
})
test('desktop renderer JavaScript parses and schedule labels are inserted as text',()=>{
 const html=fs.readFileSync('desktop-app-employee/renderer/index.html','utf8');for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(match[1].trim())new Function(match[1])}
 assert.match(html,/title.textContent=shift.isRestDay/);assert.match(html,/scheduleRequest\+\+/)
})
