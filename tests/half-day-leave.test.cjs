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

const { leaveClockInError, workedHalfPeriod, halfDayWorkedShift } = loader()('src/lib/attendance/half-day-leave.ts')
const day = new Date('2026-11-10T00:00:00Z')
const schedule = { timeIn: '08:00', timeOut: '17:00', breakMinutes: 60 }
const at = time => new Date(`2026-11-10T${time}:00+08:00`)
const leave = period => ({ isHalfDay: true, halfDayPeriod: period, leaveType: { name: 'Annual' } })
test('morning leave allows afternoon clock-in at the exact scheduled boundary', () => {
  assert.match(leaveClockInError([leave('AM')], at('08:00'), day, schedule), /13:00/)
  assert.ok(leaveClockInError([leave('AM')], at('12:59'), day, schedule))
  assert.equal(leaveClockInError([leave('AM')], at('13:00'), day, schedule), null)
})
test('afternoon leave allows morning clock-in and blocks the covered half', () => {
  assert.equal(leaveClockInError([leave('PM')], at('08:00'), day, schedule), null)
  assert.equal(leaveClockInError([leave('PM')], at('11:59'), day, schedule), null)
  assert.ok(leaveClockInError([leave('PM')], at('12:00'), day, schedule))
})
test('full-day and both halves remain blocked; legacy missing period is morning', () => {
  assert.ok(leaveClockInError([{ ...leave('AM'), isHalfDay: false }], at('13:00'), day, schedule))
  assert.ok(leaveClockInError([leave('AM'), leave('PM')], at('13:00'), day, schedule))
  assert.ok(leaveClockInError([leave(null)], at('08:00'), day, schedule))
  assert.equal(leaveClockInError([], at('08:00'), day, schedule), null)
})
test('overnight halves use the attendance date; flexible schedules fall back to Philippine noon', () => {
  const night = { timeIn: '22:00', timeOut: '06:00', breakMinutes: 0 }
  assert.ok(leaveClockInError([leave('AM')], new Date('2026-11-11T01:59:00+08:00'), day, night))
  assert.equal(leaveClockInError([leave('AM')], new Date('2026-11-11T02:00:00+08:00'), day, night), null)
  assert.equal(leaveClockInError([leave('AM')], at('12:00'), day, null), null)
})
test('the worked half has four regular hours and no leave-related late/undertime', () => {
  const { computeHours, computeLateAndUndertime } = loader({ '@/lib/prisma': { prisma: {} } })('src/lib/timesheet/compute.ts')
  for (const [period, start, end] of [['AM','08:00','12:00'],['PM','13:00','17:00']]) {
    const s = halfDayWorkedShift({ scheduleTimeIn:'08:00', scheduleTimeOut:'17:00', allowedBreakMinutes:60, plannedRegularMinutes:540 }, { isHalfDay:true, isLeave:false, halfDayPeriod:period })
    assert.equal(s.plannedRegularMinutes, 240)
    assert.equal(computeHours(at(start),at(end),null,null,{plannedRegularMinutes:s.plannedRegularMinutes,allowedBreakMinutes:s.allowedBreakMinutes,scheduledTimeIn:s.scheduleTimeIn,scheduledTimeOut:s.scheduleTimeOut}).regularHours,4)
    assert.deepEqual(computeLateAndUndertime(at(start),at(end),s.scheduleTimeIn,s.scheduleTimeOut),{lateMinutes:0,undertimeMinutes:0})
  }
  assert.equal(workedHalfPeriod([leave('AM')]),'PM')
})
test('hourly pay includes paid leave plus the worked half, without duplicating work rows', () => {
  const { scheduledHourlyPayDays } = loader()('src/lib/payroll/scheduled-hours.ts')
  const work = { date:day,isAbsent:false,isLeave:false,isLeavePaid:false,isHalfDay:true }
  const paid = { ...work,isLeave:true,isLeavePaid:true }
  const input = { attendance:[work,work,paid],assignments:[],defaultSchedule:schedule,trackTime:true,start:day,end:day }
  assert.equal(scheduledHourlyPayDays(input).hours,8)
  assert.equal(scheduledHourlyPayDays({...input,attendance:[work,{...paid,isLeavePaid:false}]}).hours,4)
})

test('real clock-in handler allows uncovered half and preserves the leave-only DTR', async t => {
  t.mock.timers.enable({apis:['Date'],now:at('13:00').getTime()})
  let created
  let leaves = [leave('AM')]
  const db = {
    employee:{findUnique:async()=>({id:'e',workScheduleId:'s',workSchedule:{...schedule,workDays:[1,2,3,4,5]}})},
    company:{findUnique:async()=>({screenCaptureEnabled:false,selfieRequired:false})},
    employeeShiftAssignment:{findMany:async()=>[]},holiday:{findFirst:async()=>null},
    leaveRequest:{findMany:async({where})=>{assert.equal(where.status,'APPROVED');return leaves}},
    dTRRecord:{findFirst:async({where})=>{if(where.timeIn===null)assert.equal(where.isLeave,false);return null},create:async({data})=>{created=data;return{id:'worked',...data}}},
  }
  const { performClockIn } = loader({
    '@/lib/prisma':{prisma:db},'@/lib/notifications':{createNotificationsForUsers:async()=>{throw Error('Unexpected notification')}},
    '@/lib/attendance/punch-target':{resolvePunchEmployeeId:async()=>({employeeId:'e'})},
    '@/lib/feature-gates':{getCompanySubscription:async()=>({}),hasScreenCaptureFeature:()=>false,isDesktopApp:()=>false},
    '@/lib/attendance/schedule-location':{resolveAttendanceLocation:async()=>({date:day,schedule,policy:{enabled:false}})},
    '@/lib/attendance/location-policy':{locationError:()=>null,geofenceStatus:()=>null},
  })('src/lib/attendance/clock-in.ts')
  const req={headers:new Headers(),json:async()=>({})}
  const response=await performClockIn(req,{companyId:'c',userId:'u'})
  assert.equal(response.status,200,JSON.stringify(await response.json()))
  assert.equal(created.isLeave,false);assert.equal(created.isHalfDay,true);assert.equal(created.halfDayPeriod,'PM')
  const {customHalfDayWindow}=loader()('src/lib/attendance/custom-half-day.ts')
  const custom=customHalfDayWindow(day,{...schedule,timezone:'Asia/Manila'},'08:00','12:00')
  leaves=[{...leave('CUSTOM'),halfDayWindow:custom}]
  assert.equal((await performClockIn(req,{companyId:'c',userId:'u'})).status,200)
  assert.deepEqual(created.halfDayWindow,custom)
  leaves=[leave('PM')];created=null
  assert.equal((await performClockIn(req,{companyId:'c',userId:'u'})).status,403)
  assert.equal(created,null)
})






test('company DTR recomputation preserves the worked half instead of restoring morning lateness', async () => {
  let saved
  const d={id:'d',employeeId:'e',date:day,timeIn:at('13:00'),timeOut:at('17:00'),breakIn:null,breakOut:null,isHalfDay:true,isLeave:false,halfDayPeriod:'PM',regularHours:4,overtimeHours:0,nightDiffHours:0,lateMinutes:300,undertimeMinutes:0,employee:{workScheduleId:'s',workSchedule:schedule}}
  const real=loader({'@/lib/prisma':{prisma:{}}})('src/lib/timesheet/compute.ts')
  const {recomputeCompanyDtrHours}=loader({
    '@/lib/prisma':{prisma:{company:{findUnique:async()=>({defaultBreakMinutes:60})},dTRRecord:{findMany:async args=>{assert.equal(args.select.isHalfDay,true);return[d]},update:async args=>{saved=args.data}}}},
    './compute':{...real,getCompanyNightDiffWindow:async()=>({startMins:1320,endMins:360,includesBreak:false}),resolveShiftForDtr:async()=>({scheduleTimeIn:'08:00',scheduleTimeOut:'17:00',allowedBreakMinutes:60,plannedRegularMinutes:540,scheduledStart:at('08:00'),scheduledEnd:at('17:00')})},
  })('src/lib/timesheet/recompute.ts')
  await recomputeCompanyDtrHours('c');assert.equal(saved.lateMinutes,0);assert.equal(saved.undertimeMinutes,0);assert.equal(saved.regularHours,4)
})

test('half-day hour choices match the clock-in boundary and show overnight days', () => {
  const {halfDayOptions}=loader()('src/lib/attendance/half-day-leave.ts')
  const options=halfDayOptions(schedule)
  assert.equal(options[0].label,'8:00 AM - 12:00 PM')
  assert.equal(options[0].workLabel,'1:00 PM - 5:00 PM')
  assert.equal(options[1].label,'1:00 PM - 5:00 PM')
  assert.equal(halfDayOptions({...schedule,breakEnabled:false})[0].end,'12:30')
  assert.match(halfDayOptions({timeIn:'22:00',timeOut:'06:00',breakMinutes:0})[1].label,/2:00 AM \(next day\)/)
  assert.deepEqual(halfDayOptions(null),[])
})

test('custom hours validate half the net shift and exclude leave from clock-in and pay',()=>{
 const {customHalfDayWindow}=loader()('src/lib/attendance/custom-half-day.ts')
 const window=customHalfDayWindow(day,{...schedule,timezone:'Asia/Manila'},'09:00','14:00')
 const custom={...leave('CUSTOM'),halfDayWindow:window}
 assert.ok(leaveClockInError([custom],at('10:00'),day,schedule))
 assert.equal(leaveClockInError([custom],at('14:00'),day,schedule),null)
 assert.throws(()=>customHalfDayWindow(day,{...schedule,timezone:'Asia/Manila'},'09:00','13:00'),/exactly 4/)
 assert.throws(()=>customHalfDayWindow(day,{...schedule,timezone:'Asia/Manila'},'07:00','11:00'),/within/)
 const real=loader({'@/lib/prisma':{prisma:{}}})('src/lib/timesheet/compute.ts')
 const base={scheduleTimeIn:'08:00',scheduleTimeOut:'17:00',allowedBreakMinutes:60,plannedRegularMinutes:540,scheduledStart:at('08:00'),scheduledEnd:at('17:00')}
 for(const [start,end,hours] of [['08:00','17:00',4],['08:00','09:00',1],['14:00','17:00',3]]){
   const shift=halfDayWorkedShift(base,{isHalfDay:true,isLeave:false,halfDayPeriod:'CUSTOM',halfDayWindow:window,timeIn:at(start),timeOut:at(end)})
   assert.equal(real.computeHours(at(start),at(end),null,null,shift).regularHours,hours)
   assert.equal(real.computeHours(at(start),at(end),null,null,shift).overtimeHours,0)
   assert.deepEqual(real.computeLateAndUndertime(at(start),at(end),shift.scheduleTimeIn,shift.scheduleTimeOut,shift),{lateMinutes:0,undertimeMinutes:0})
 }
})
test('custom overnight hours retain exact instants and reject malformed input',()=>{
 const {customHalfDayWindow}=loader()('src/lib/attendance/custom-half-day.ts')
 const w=customHalfDayWindow(day,{timeIn:'22:00',timeOut:'06:00',breakMinutes:0,timezone:'Asia/Manila'},'02:00','06:00')
 assert.equal(w.start,'2026-11-10T18:00:00.000Z')
 assert.throws(()=>customHalfDayWindow(day,{...schedule,timezone:'Asia/Manila'},'25:00','06:00'))
})
