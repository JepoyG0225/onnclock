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

const tz=loader()('src/lib/attendance/timezone.ts')
const day=s=>new Date(s+'T00:00:00Z')
test('IANA schedule clocks follow winter and summer offsets, including fractional offsets',()=>{
 assert.equal(tz.zonedInstant(day('2026-11-12'),'09:00','America/New_York').toISOString(),'2026-11-12T14:00:00.000Z')
 assert.equal(tz.zonedInstant(day('2026-07-12'),'09:00','America/New_York').toISOString(),'2026-07-12T13:00:00.000Z')
 assert.equal(tz.zonedInstant(day('2026-11-12'),'09:00','Asia/Kolkata').toISOString(),'2026-11-12T03:30:00.000Z')
 assert.equal(tz.scheduleTimezoneSchema.safeParse('made-up').success,false)
})
test('DST gaps move forward and repeated hours choose the first occurrence',()=>{
 assert.equal(tz.zonedInstant(day('2026-03-08'),'02:30','America/New_York').toISOString(),'2026-03-08T07:30:00.000Z')
 assert.equal(tz.zonedInstant(day('2026-11-01'),'01:30','America/New_York').toISOString(),'2026-11-01T05:30:00.000Z')
 const shift=tz.scheduleInstants(day('2026-10-31'),'22:00','06:00','America/New_York')
 assert.equal((shift.scheduledEnd-shift.scheduledStart)/3600000,9)
})
test('foreign scheduled day resolves before and after Philippine midnight',async()=>{
 const fixed={timezone:'America/New_York',timeIn:'09:00',timeOut:'18:00'}
 const lib=loader({'@/lib/prisma':{prisma:{employee:{findFirstOrThrow:async()=>({workSchedule:fixed,company:{}})},employeeShiftAssignment:{findMany:async()=>[]}}}})('src/lib/attendance/schedule-location.ts')
 assert.equal((await lib.resolveAttendanceLocation('c','e',new Date('2026-11-12T14:00:00Z'))).date.toISOString().slice(0,10),'2026-11-12')
 assert.equal((await lib.resolveAttendanceLocation('c','e',new Date('2026-11-12T23:00:00Z'))).date.toISOString().slice(0,10),'2026-11-12')
 fixed.timeIn='22:00';fixed.timeOut='06:00'
 assert.equal((await lib.resolveAttendanceLocation('c','e',new Date('2026-11-13T09:00:00Z'))).date.toISOString().slice(0,10),'2026-11-12')
})
test('assigned timezone can differ from employee default and selects its own calendar date',async()=>{
 const assignment={date:day('2026-11-12'),timeIn:null,timeOut:null,schedule:{timezone:'America/Los_Angeles',timeIn:'09:00',timeOut:'18:00'}}
 const lib=loader({'@/lib/prisma':{prisma:{employee:{findFirstOrThrow:async()=>({workSchedule:{timezone:'Asia/Manila'},company:{}})},employeeShiftAssignment:{findMany:async()=>[assignment]}}}})('src/lib/attendance/schedule-location.ts')
 const result=await lib.resolveAttendanceLocation('c','e',new Date('2026-11-13T01:00:00Z'))
 assert.equal(result.date.toISOString().slice(0,10),'2026-11-12');assert.equal(result.schedule.timezone,'America/Los_Angeles')
})
test('resolved foreign shift computes exact lateness and undertime and half-day bounds',async()=>{
 const lib=loader({'@/lib/prisma':{prisma:{employeeShiftAssignment:{findMany:async()=>[]}}}})('src/lib/timesheet/compute.ts')
 const shift=await lib.resolveShiftForDtr({employeeId:'e',date:day('2026-11-12'),actualTimeIn:new Date('2026-11-12T14:05:00Z'),employee:{workScheduleId:'s',workSchedule:{timezone:'America/New_York',timeIn:'09:00',timeOut:'18:00',breakMinutes:60,workHoursPerDay:8}}})
 assert.equal(shift.scheduledEnd.toISOString(),'2026-11-12T23:00:00.000Z')
 assert.deepEqual(lib.computeLateAndUndertime(new Date('2026-11-12T14:05:00Z'),new Date('2026-11-12T22:50:00Z'),shift.scheduleTimeIn,shift.scheduleTimeOut,shift),{lateMinutes:5,undertimeMinutes:10})
 const half=loader()('src/lib/attendance/half-day-leave.ts')
 const worked=half.halfDayWorkedShift(shift,{isHalfDay:true,halfDayPeriod:'PM'})
 assert.equal(worked.scheduledStart.toISOString(),'2026-11-12T19:00:00.000Z')
 assert.ok(half.leaveClockInError([{isHalfDay:true,halfDayPeriod:'AM'}],new Date('2026-11-12T18:59:00Z'),day('2026-11-12'),{timezone:'America/New_York',timeIn:'09:00',timeOut:'18:00',breakMinutes:60}))
 assert.equal(half.leaveClockInError([{isHalfDay:true,halfDayPeriod:'AM'}],new Date('2026-11-12T19:00:00Z'),day('2026-11-12'),{timezone:'America/New_York',timeIn:'09:00',timeOut:'18:00',breakMinutes:60}),null)
})
