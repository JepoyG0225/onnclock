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

const {countLeaveDays,leaveDatesSchema}=loader()('src/lib/leaves/duration.ts')
const saturday={name:'Saturday shift',timeIn:'08:00',timeOut:'17:00',workDays:[6]}
test('scheduled Saturday is payable leave, rest-day overrides are excluded, half days stay 0.5',()=>{
 assert.equal(countLeaveDays('2026-11-14','2026-11-14',false,[],saturday),1)
 assert.equal(countLeaveDays('2026-11-14','2026-11-14',true,[],saturday),0.5)
 assert.equal(countLeaveDays('2026-11-14','2026-11-14',false,[{date:new Date('2026-11-14'),timeIn:null,timeOut:null,isRestDay:true,schedule:saturday}],saturday),0)
 assert.equal(leaveDatesSchema.safeParse({startDate:'2026-02-30',endDate:'2026-02-30'}).success,false)
 assert.equal(leaveDatesSchema.safeParse({startDate:'2026-11-15',endDate:'2026-11-14'}).success,false)
})
function api(available=5){
 let saved,increment
 const n=v=>({toNumber:()=>v,valueOf:()=>v})
 const balance={id:'b',entitled:n(available),carriedOver:n(0),used:n(0),pending:n(0),encashed:n(0)}
 const p={employee:{findFirst:async()=>({id:'e',workSchedule:saturday}),findUnique:async()=>({firstName:'Test',lastName:'Employee'})},employeeShiftAssignment:{findMany:async()=>[]},leaveType:{findFirst:async()=>({id:'t'}),findUnique:async()=>({name:'Annual'})},leaveBalance:{findFirst:async()=>balance,findUniqueOrThrow:async()=>balance,updateMany:async args=>{increment=args.data.pending.increment}},leaveRequest:{create:async args=>{saved=args.data;return {id:'r',...saved}}},$queryRaw:async()=>[]}
 p.$transaction=async fn=>fn(p)
 const route=loader({'@/lib/prisma':{prisma:p},'@/lib/api-auth':{requireAuth:async()=>({ctx:{userId:'u',companyId:'c',role:'EMPLOYEE'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>false},'@/lib/audit':{logAudit:async()=>{}},'@/lib/notifications':{createNotificationsForUsers:async()=>{}},'@/lib/approvals/engine':{resolveWorkflow:async()=>null},'@/lib/approvals/notify':{dispatchNotifySteps:async()=>{}}})('src/app/api/leaves/route.ts')
 return {submit:body=>route.POST(new Request('https://example.test/api/leaves',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leaveTypeId:'t',startDate:'2026-11-14',endDate:'2026-11-14',...body})})),saved:()=>saved,increment:()=>increment}
}
test('employee can submit legacy zero-day payload on assigned weekend; server reserves exactly one day',async()=>{
 const a=api();const r=await a.submit({totalDays:0});assert.equal(r.status,201);assert.equal(a.saved().totalDays,1);assert.equal(a.increment(),1)
})
test('client cannot understate leave duration or bypass balance checks',async()=>{
 const a=api(0.5);const r=await a.submit({totalDays:0.01});assert.equal(r.status,400);assert.match((await r.json()).error,/Insufficient/);assert.equal(a.saved(),undefined)
})
test('half-day submissions reserve 0.5 regardless of submitted day count',async()=>{
 const a=api();const r=await a.submit({isHalfDay:true,halfDayPeriod:'PM',totalDays:0});assert.equal(r.status,201);assert.equal(a.increment(),0.5)
})
test('rest-day requests explain the schedule problem instead of generic validation error',async()=>{
 const a=api();const r=await a.submit({startDate:'2026-11-15',endDate:'2026-11-15',totalDays:0});assert.equal(r.status,422);assert.match((await r.json()).error,/No scheduled working days/)
})
