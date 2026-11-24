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

const calc=loader()('src/lib/salary/calculation.ts')
const policy=loader()('src/lib/hr-center/policy.ts')
const engine=loader()('src/lib/payroll/engine.ts')
const day=(date,rate=150)=>({date,rate,basicUnits:4,holidayUnits:0,premiumUnits:0,otUnits:0,nightUnits:0,lateUnits:0,underUnits:0})
const snapshot=(days,rateType='HOURLY')=>calc.calculateSalary({version:1,rateType,divisor:22,hours:8,days,amounts:{},changeIds:[]},[])
const change={id:'change',effectiveDate:'2026-10-16',beforeAmount:150,amount:200,rateType:'HOURLY'}
test('effective date is inclusive and earlier dates retain their historical rate',()=>{
 const result=calc.calculateSalary(snapshot([day('2026-10-15'),day('2026-10-16')]),[change])
 assert.equal(result.amounts.basicPay,1400);assert.deepEqual(result.days.map(d=>d.rate),[150,200])
 assert.equal(calc.salaryAt([change],'2026-10-01',999),150)
})
test('hourly salary changes use scheduled hours and deduct lateness only once',()=>{
 const before=snapshot([day('2026-10-15'),{...day('2026-10-16'),lateUnits:30,underUnits:15}])
 const after=calc.calculateSalary(before,[change]),v=input();v.attendance.scheduledHours=8;v.rateAmounts=after.amounts
 const result=engine.computePayroll(v)
 assert.equal(result.basicPay,1400);assert.equal(result.lateDeduction,100);assert.equal(result.undertimeDeduction,50);assert.equal(result.netPay,1250)
})
test('monthly rates split using configured daily divisor, including half days',()=>{
 const before=snapshot([{...day('2026-10-15',22000),basicUnits:1},{...day('2026-10-16',22000),basicUnits:.5}],'MONTHLY')
 const result=calc.calculateSalary(before,[{...change,beforeAmount:22000,amount:26400,rateType:'MONTHLY'}])
 assert.equal(result.amounts.basicPay,1600)
})
test('daily holiday credit, holiday premium, overtime and night differential use date-specific rates',()=>{
 const before=snapshot([{...day('2026-10-15',800),basicUnits:0,holidayUnits:1},{...day('2026-10-16',800),basicUnits:1,premiumUnits:.3,otUnits:2*1.25,nightUnits:2*.1}],'DAILY')
 const result=calc.calculateSalary(before,[{...change,beforeAmount:800,amount:1000,rateType:'DAILY'}])
 assert.equal(result.amounts.basicPay,1800);assert.equal(result.amounts.holidayPayAmount,300);assert.equal(result.amounts.regularOtAmount,312.5);assert.equal(result.amounts.nightDiffAmount,25)
})
test('later changes preserve preceding dated rates and repeated calculation is idempotent',()=>{
 const changes=[change,{...change,id:'second',effectiveDate:'2026-10-20',amount:250,beforeAmount:200}]
 const first=calc.calculateSalary(snapshot([day('2026-10-15'),day('2026-10-16'),day('2026-10-20')]),changes)
 assert.equal(first.amounts.basicPay,2400);assert.deepEqual(calc.calculateSalary(first,changes),first)
})
test('retro pay compares immutable snapshots and retains separate basic and premium differences',()=>{
 const original=snapshot([{...day('2026-10-16'),premiumUnits:2,lateUnits:30}]);const json=JSON.stringify(original)
 const updated=calc.calculateSalary(original,[change]);assert.deepEqual(calc.retroDifference(original,updated),{basic:200,other:75,total:275});assert.equal(JSON.stringify(original),json)
})
test('retro basic accrues 13th month and contributes to gross even without current attendance',()=>{
 const v=input();v.attendance.daysWorked=0;v.attendance.regularHours=0;v.attendance.scheduledHours=0;v.retroBasic=1200;v.additionalTaxableIncome=200
 const r=engine.computePayroll(v);assert.equal(r.basicPay,1200);assert.equal(r.grossPay,1400);assert.equal(r.thirteenthMonthContribution,100)
})
test('government deductions run once on the combined dated salary earnings',()=>{
 const v=input();v.employee.sssEnabled=true;v.employee.philhealthEnabled=true;v.employee.pagibigEnabled=true;v.employee.withholdingTaxEnabled=true;v.employee.isExemptFromTax=false
 const totals=calc.calculateSalary(snapshot([day('2026-10-15'),day('2026-10-16')]),[change]).amounts
 const dated=engine.computePayroll({...v,rateAmounts:totals})
 const equivalent=engine.computePayroll({...v,attendance:{...v.attendance,scheduledHours:totals.basicPay/150}})
 for(const k of ['sssEmployee','philhealthEmployee','pagibigEmployee','withholdingTax','grossPay'])assert.equal(dated[k],equivalent[k])
})
function salaryService(){const writes=[];const tx={$executeRaw:async()=>{},$queryRaw:async()=>{},employee:{findFirst:async()=>({id:'employee',userId:'employee-user',rateType:'HOURLY',basicSalary:150}),update:async v=>writes.push(v)},hrOperation:{findMany:async()=>[]},hrOperationEvent:{create:async v=>writes.push(v)},payrollRun:{updateMany:async v=>writes.push(v)}};const api=loader({'@/lib/prisma':{prisma:{}}})('src/lib/salary/service.ts');return {writes,tx,api}}
const request=()=>({id:'r',companyId:'company',employeeId:'employee',createdBy:'creator',status:'PENDING',data:{effectiveDate:'2026-10-16',amount:200,rateType:'HOURLY',originalAmount:150}})
test('salary approval blocks self-approval and insufficient permission before writing',async()=>{
 const s=salaryService();await assert.rejects(s.api.decideSalary(s.tx,request(),'creator','APPROVE','Reviewed',true),/different user/);await assert.rejects(s.api.decideSalary(s.tx,request(),'reviewer','APPROVE','Reviewed',false),/different user/);assert.equal(s.writes.length,0)
})
test('salary approval refuses a changed employee rate',async()=>{const s=salaryService(),r=request();r.data.originalAmount=100;await assert.rejects(s.api.decideSalary(s.tx,r,'reviewer','APPROVE','Reviewed',true),/changed after submission/);assert.equal(s.writes.length,0)})
test('future approved rates do not change current employee salary early',async()=>{
 const s=salaryService(),r=request();r.data.effectiveDate='2099-01-01';const result=await s.api.decideSalary(s.tx,r,'reviewer','APPROVE','Reviewed',true)
 assert.equal(result.status,'APPROVED');assert.equal(result.data.beforeAmount,150);assert.ok(!s.writes.some(w=>w.data?.basicSalary))
})
test('approved history cannot be duplicated or inserted out of order',async()=>{
 const s=salaryService();s.tx.hrOperation.findMany=async()=>[{id:'prior',data:change}]
 await assert.rejects(s.api.decideSalary(s.tx,request(),'reviewer','APPROVE','Reviewed',true),/later than the latest/)
 assert.equal(s.writes.length,0)
})
const incident=()=>({incidentDate:'2026-10-01',incidentTime:'14:30',location:'Office',category:'INJURY',severity:'MODERATE',description:'Employee slipped on a wet floor.',lostDays:1,rootCause:'Wet floor',investigationFindings:'Cleaning area was not marked.',correctiveActions:[{description:'Install warning signs',ownerId:'manager',dueDate:'2026-10-02',completedDate:null,effectiveness:''}],closureNotes:'Verified'})
test('safety input validates time, date, lost days and structured corrective actions',()=>{
 assert.equal(policy.payloadSchemas.SAFETY_INCIDENT.safeParse(incident()).success,true)
 for(const patch of [{incidentTime:'25:00'},{lostDays:-1},{correctiveActions:[{description:'Fix'}]}])assert.equal(policy.payloadSchemas.SAFETY_INCIDENT.safeParse({...incident(),...patch}).success,false)
})
test('safety closure requires findings, root cause, completed actions and effectiveness checks',()=>{
 const d=incident();assert.ok(policy.validateState('SAFETY_INCIDENT','COMPLETED',d,'2026-10-05'))
 d.correctiveActions[0].completedDate='2026-10-02';d.correctiveActions[0].effectiveness='Verified signs in place'
 assert.equal(policy.validateState('SAFETY_INCIDENT','COMPLETED',d,'2026-10-05'),null)
 d.rootCause='';assert.ok(policy.validateState('SAFETY_INCIDENT','COMPLETED',d,'2026-10-05'))
})
test('safety reporting date requires official reference and cannot precede incident',()=>{
 assert.ok(policy.validateState('SAFETY_INCIDENT','OPEN',{...incident(),reportedDate:'2026-09-30',officialReference:'R'},'2026-10-05'))
 assert.ok(policy.validateState('SAFETY_INCIDENT','OPEN',{...incident(),reportedDate:'2026-10-02',officialReference:''},'2026-10-05'))
})
test('safety report denies callers without safety permission',async()=>{
 const api=loader({'@/lib/prisma':{prisma:{}},'@/lib/hr-center/access':{hrAccess:async()=>({ctx:{companyId:'company'},kinds:[]})}})('src/app/api/hr-center/safety-report/route.ts')
 assert.equal((await api.GET({})).status,403)
})
test('safety CSV export uses tenant scope and prevents spreadsheet formulas',async()=>{
 let query;const api=loader({'@/lib/prisma':{prisma:{hrOperation:{findMany:async q=>{query=q;return [{id:'r',title:'=HYPERLINK("bad")',status:'OPEN',employee:null,data:{incidentDate:'2026-10-01',correctiveActions:[]}}]}},userCompany:{findMany:async()=>[]}}},'@/lib/hr-center/access':{hrAccess:async()=>({ctx:{companyId:'company'},kinds:['SAFETY_INCIDENT']})}})('src/app/api/hr-center/safety-report/route.ts')
 const response=await api.GET({nextUrl:new URL('https://example.test/?from=2026-10-01&to=2026-10-31')});assert.equal(response.status,200);assert.equal(query.where.companyId,'company');assert.match(await response.text(),/'=HYPERLINK/)
})

function retroApi({scope='ALL',targetStatus='DRAFT',missingSnapshot=false}={}){
 const record={...request(),id:'change',status:'APPROVED',version:1,data:{...change}},writes=[],queries=[]
 const slip={id:'slip',employeeId:'employee',manualEdits:null,calculationBasis:{salarySnapshot:missingSnapshot?null:snapshot([day('2026-10-16')])},payrollRun:{periodStart:new Date('2026-10-01'),periodEnd:new Date('2026-10-16'),payDate:new Date('2026-10-20')}}
 const target={id:'target',periodStart:new Date('2026-10-17'),periodEnd:new Date('2026-10-31'),payDate:new Date('2026-11-05'),employeeScopeMode:scope,employeeIds:[],employmentTypeFilter:[],status:targetStatus}
 const tx={$executeRaw:async()=>{},hrOperation:{findFirst:async q=>{queries.push(q);return record},findMany:async()=>[record],update:async q=>{writes.push(q);Object.assign(record,q.data)}},hrOperationEvent:{create:async q=>writes.push(q)},payrollRun:{findMany:async()=>[target],findFirst:async q=>q.where.status.in.includes(target.status)?target:null,update:async q=>writes.push(q)},employee:{findFirst:async()=>({id:'employee',employmentType:'FULL_TIME'})},payslip:{findMany:async q=>{queries.push(q);return [slip]}}}
 tx.$transaction=fn=>fn(tx)
 const api=loader({'@/lib/prisma':{prisma:tx},'@/lib/hr-center/access':{hrAccess:async()=>({ctx:{companyId:'company',userId:'reviewer'},employeeId:null,kinds:['SALARY_CHANGE'],granted:['salarychanges:approve']})}})('src/app/api/hr-center/[id]/salary-review/route.ts')
 const params={params:Promise.resolve({id:'change'})}
 return {writes,queries,record,preview:async()=>await (await api.GET({},params)).json(),post:items=>api.POST({json:async()=>({runId:'target',note:'Verified retro difference',items})},params)}
}
test('retro scheduling is tenant scoped, marks target for recompute, and refuses duplicate application',async()=>{
 const s=retroApi(),p=await s.preview();assert.equal(p.items[0].basic,200)
 assert.equal((await s.post(p.items)).status,200);assert.equal(s.record.data.retroTargetRunId,'target')
 assert.ok(s.writes.some(w=>w.where?.id==='target'&&w.data.status==='DRAFT'))
 assert.equal((await s.post(p.items)).status,409)
 assert.equal(s.queries[0].where.companyId,'company')
})
test('retro scheduling rejects a payroll scope that omits the employee',async()=>{
 const s=retroApi({scope:'CUSTOM'}),p=await s.preview();assert.equal((await s.post(p.items)).status,422);assert.equal(s.writes.length,0)
})
test('retro scheduling refuses locked targets and legacy snapshots without changing payroll',async()=>{
 const locked=retroApi({targetStatus:'LOCKED'}),p=await locked.preview();assert.equal((await locked.post(p.items)).status,409);assert.equal(locked.writes.length,0)
 const legacy=retroApi({missingSnapshot:true}),l=await legacy.preview();assert.equal(l.issues.length,1);assert.equal((await legacy.post(l.items)).status,409);assert.equal(legacy.writes.length,0)
})
