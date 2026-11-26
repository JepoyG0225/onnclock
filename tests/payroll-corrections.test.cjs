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



const input = () => ({
  employee: {id:'test',basicSalary:150,dailyRate:1200,hourlyRate:150,rateType:'HOURLY',payFrequency:'SEMI_MONTHLY',isMinimumWageEarner:false,isExemptFromTax:true,sssEnabled:false,philhealthEnabled:false,pagibigEnabled:false,withholdingTaxEnabled:false},
  period: {start:new Date('2026-09-26'),end:new Date('2026-10-10'),workingDays:10,payFrequency:'SEMI_MONTHLY',isFirstCutoff:false,nightDifferentialRate:.1,workHoursPerDay:8,workingDaysPerMonth:22},
  attendance: {daysWorked:4,regularHours:19,scheduledHours:19,regularOtHours:0,restDayOtHours:0,regularHolidayOtHours:0,specialHolidayOtHours:0,nightDiffHours:0,lateMinutes:0,undertimeMinutes:0,absentDays:0,regularHolidaysWorked:0,specialHolidaysWorked:0},
  loans:[],deMinimis:{riceSubsidy:0,clothing:0,medical:0,laundry:0,meal:0,other:0},allowances:{rice:0,clothing:0,medical:0,transportation:0,other:0},additionalTaxableIncome:0,additionalNonTaxableIncome:0,ytd:{grossPay:0,taxableIncome:0,withholdingTax:0,thirteenthMonthContrib:0}
})


const c=loader()('src/lib/payroll/corrections.ts')
const amounts=(overrides={})=>Object.fromEntries(c.correctionFields.map(k=>[k,overrides[k]??0]))
test('late-approved paid leave returns absence deductions as basic wages',()=>{
 const before=amounts({basicSalary:12500,absenceDeduction:1000}),after=amounts({basicSalary:12500})
 assert.deepEqual(c.correctionDifference(before,after),{basic:1000,other:0,total:1000})
})
test('OT and night differential corrections remain separate from basic wages',()=>{
 assert.deepEqual(c.correctionDifference(amounts({basicSalary:1000,regularOtAmount:100}),amounts({basicSalary:1200,regularOtAmount:200,nightDiffAmount:30})),{basic:200,other:130,total:330})
})
test('previous retro wages are excluded when a target becomes a correction source',()=>{
 const v=c.correctionAmounts({basicSalary:1800,calculationBasis:{retroItems:[{basic:300}],corrections:[{basic:500}]}})
 assert.equal(v.basicSalary,1000)
})
test('re-review against last approved amounts cannot pay the same increase twice',()=>{
 const original=amounts({basicSalary:1000}),revised=amounts({basicSalary:1300})
 assert.equal(c.correctionDifference(original,revised).total,300)
 assert.equal(c.correctionDifference(revised,revised).total,0)
 assert.equal(c.correctionDifference(revised,amounts({basicSalary:1350})).total,50)
})
test('recoveries remain signed for explicit review rather than turning into earnings',()=>{
 assert.equal(c.correctionDifference(amounts({basicSalary:1000}),amounts({basicSalary:800})).total,-200)
})
test('readiness respects payroll scope and excludes tracking-off approval warnings',async()=>{
 const employees=[{id:'a',firstName:'A',lastName:'One',employeeNo:'1',basicSalary:100,bankName:'Bank',bankAccountNo:'123',trackTime:false,workScheduleId:null},{id:'b',firstName:'B',lastName:'Two',employeeNo:'2',basicSalary:0,trackTime:true,workScheduleId:null}]
 const db={overtimeRequest:{findMany:async()=>[]},employee:{findMany:async({where})=>{assert.deepEqual(where.id,{in:['a','b']});return employees}},dTRRecord:{findMany:async()=>[{employeeId:'a',timeIn:new Date(),timeOut:null,approvedBy:null},{employeeId:'b',timeIn:new Date(),timeOut:null,approvedBy:null}]},leaveRequest:{findMany:async()=>[{employeeId:'b'}]},employeeShiftAssignment:{findMany:async()=>[]}}
 const {payrollReadiness}=loader({'@/lib/prisma':{prisma:db}})('src/lib/payroll/readiness.ts')
 const result=await payrollReadiness({companyId:'company',employeeScopeMode:'CUSTOM',employeeIds:['a','b'],periodStart:new Date(),periodEnd:new Date()})
 assert.equal(result.issues.filter(i=>i.employeeId==='a').length,0)
 assert.deepEqual(result.issues.map(i=>i.code).sort(),['bank','leave','open','salary','schedule'])
})

function correctionApi({permission=true,sourceHash='snapshot',creator='maker',sourceCompany='company',status='PENDING'}={}){
 const writes=[];const item={id:'adjustment',employeeId:'employee',companyId:'company',kind:'PAYROLL_ADJUSTMENT',createdBy:creator,status,data:{sourceRunId:'source',sourceHash:'snapshot',before:amounts({basicSalary:1000}),after:amounts({basicSalary:1500}),basic:500,other:0,total:500}}
 const source={id:'source',companyId:sourceCompany,runType:'REGULAR',status:'APPROVED',periodEnd:new Date('2026-10-15')}
 const target={id:'target',companyId:'company',runType:'REGULAR',status:'COMPUTED',periodStart:new Date('2026-10-16'),employeeScopeMode:'CUSTOM',employeeIds:['employee']}
 const tx={$executeRaw:async()=>{},hrOperation:{findFirst:async()=>item,count:async()=>0,update:async args=>writes.push(args)},employee:{findFirst:async()=>({id:'employee',userId:'employee-user'})},payrollRun:{findFirst:async({where})=>where.id==='source'?source:target,update:async args=>writes.push(args)}}
 const db={payrollRun:{findFirst:async({where})=>where.companyId===sourceCompany?source:null},$transaction:async fn=>fn(tx)}
 const route=loader({'@/lib/prisma':{prisma:db},'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company',userId:'reviewer',role:'PAYROLL_OFFICER'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>permission},'@/lib/payroll/correction-source':{correctionSource:async()=>sourceHash},'../compute/route':{POST:async()=>{throw Error('Unexpected compute')}}})('src/app/api/payroll/[runId]/corrections/route.ts')
 const call=(body)=>route.POST({json:async()=>body},{params:Promise.resolve({runId:'source'})})
 return {call,writes,tx,item}
}
test('read-only user cannot propose or approve payroll corrections',async()=>{
 const s=correctionApi({permission:false});for(const action of ['propose','approve','reject','cancel'])assert.equal((await s.call({action})).status,403);assert.equal(s.writes.length,0)
})
test('cross-company payroll is not visible to correction actions',async()=>{
 const s=correctionApi({sourceCompany:'other'});assert.equal((await s.call({action:'approve'})).status,404);assert.equal(s.writes.length,0)
})
test('independent approval schedules once and requires target recomputation',async()=>{
 const s=correctionApi();const r=await s.call({action:'approve',id:'adjustment',targetRunId:'target',note:'Verified corrected attendance'});assert.equal(r.status,200);assert.equal(s.writes[0].data.status,'DRAFT');assert.equal(s.writes[1].data.status,'APPROVED');assert.equal(s.writes[1].data.data.targetRunId,'target')
 s.item.status='APPROVED';assert.equal((await s.call({action:'approve',id:'adjustment',targetRunId:'target',note:'Duplicate approval'})).status,409);assert.equal(s.writes.length,2)
})
test('self-approval and stale source data never allocate money',async()=>{
 for(const opts of [{creator:'reviewer'},{sourceHash:'changed'}]){const s=correctionApi(opts);assert.equal((await s.call({action:'approve',id:'adjustment',targetRunId:'target',note:'Review correction'})).status,409);assert.equal(s.writes.length,0)}
})
test('target payroll must include the employee',async()=>{
 const s=correctionApi();s.tx.payrollRun.findFirst=async({where})=>where.id==='source'?{periodEnd:new Date('2026-10-15')}:{id:'target',periodStart:new Date('2026-10-16'),employeeScopeMode:'CUSTOM',employeeIds:[]};assert.equal((await s.call({action:'approve',id:'adjustment',targetRunId:'target',note:'Review correction'})).status,409);assert.equal(s.writes.length,0)
})

test('approval requires explicit adjustment and target identifiers',async()=>{for(const body of [{action:'approve',note:'Review correction'},{action:'approve',id:'adjustment',note:'Review correction'}]){const s=correctionApi();assert.equal((await s.call(body)).status,409);assert.equal(s.writes.length,0)}})
