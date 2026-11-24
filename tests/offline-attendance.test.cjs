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






process.env.NEXTAUTH_SECRET='offline-unit-test-secret'
const tokens=loader()('src/lib/attendance/offline-token.ts')
test('offline permit is signed, identity bound and expiring',()=>{const {token}=tokens.issueOfflinePermit('e','c',null),decoded=tokens.verifyOfflinePermit(token);assert.equal(decoded.employeeId,'e');assert.equal(decoded.companyId,'c');assert.ok(decoded.expiresAt>decoded.issuedAt);assert.throws(()=>tokens.verifyOfflinePermit(token+'x'))})
function harness(){const seen=new Map(),records=new Map(),activities=[];let fail=false
 const employee={id:'e',workScheduleId:'schedule',workSchedule:{workDays:[0,1,2,3,4,5,6]},company:{screenCaptureEnabled:false,selfieRequired:false},firstName:'Test',lastName:'User'}
 const db={employee:{findFirst:async()=>employee},employeeShiftAssignment:{findMany:async()=>[]},offlineAttendanceEvent:{findUnique:async q=>seen.get(q.where.id),create:async q=>{seen.set(q.data.id,q.data);return q.data}},dTRRecord:{findFirst:async q=>q.where.id?records.get(q.where.id):null,create:async q=>{records.set(q.data.id,q.data);return q.data},update:async q=>{Object.assign(records.get(q.where.id),q.data)},findUnique:async q=>records.get(q.where.id)},leaveRequest:{findMany:async()=>[]},holiday:{findFirst:async()=>null},attendanceActivity:{create:async q=>{activities.push(q.data);return q.data}},$queryRaw:async()=>[]}
 db.$transaction=async fn=>fn(db)
 const {POST}=loader({'@/lib/prisma':{prisma:db},'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c',userId:'u'}})},'@/lib/attendance/activities':{normalizeActivityPhoto:async p=>p},'@/lib/attendance/schedule-location':{resolveAttendanceLocation:async()=>({date:new Date('2026-11-09'),policy:{enabled:false}})},'@/lib/attendance/location-policy':{locationError:()=>null},'@/lib/timesheet/compute':{resolveShiftForDtr:async()=>({}),computeHours:()=>({regularHours:1,overtimeHours:0,nightDiffHours:0}),computeLateAndUndertime:()=>({lateMinutes:0,undertimeMinutes:0})},'@/lib/notifications':{},'@/lib/overtime-requests':{syncAutoOvertimeRequest:async()=>{}}})('src/app/api/attendance/offline/route.ts')
 const permit=tokens.issueOfflinePermit('e','c',null)
 const event={token:permit.token,id:'00000000-0000-4000-8000-000000000001',shiftId:'00000000-0000-4000-8000-000000000002',kind:'IN',at:new Date().toISOString(),photos:[]}
 return {seen,records,activities,event,post:body=>POST({headers:new Headers(),json:async()=>body})}
}
test('clock-in retries do not duplicate attendance; logs preserve original timestamps and photos',async()=>{const h=harness();assert.equal((await h.post(h.event)).status,200);assert.equal((await h.post(h.event)).status,200);assert.equal(h.records.size,1);const log={...h.event,id:'00000000-0000-4000-8000-000000000003',kind:'LOG',description:'Visit',photos:['photo1','photo2']};assert.equal((await h.post(log)).status,200);assert.equal((await h.post(log)).status,200);assert.equal(h.activities.length,1);assert.equal(h.activities[0].loggedAt.toISOString(),log.at);assert.equal(h.activities[0].photoCount,2)})
test('conflicting retries, future timestamps, and activities without shift are rejected',async()=>{const h=harness();assert.equal((await h.post({...h.event,kind:'LOG',description:'Visit',photos:['photo']})).status,409);await h.post(h.event);assert.equal((await h.post({...h.event,at:new Date(Date.now()+86400000).toISOString()})).status,409);assert.equal((await h.post({...h.event,photos:['changed']})).status,409)})
