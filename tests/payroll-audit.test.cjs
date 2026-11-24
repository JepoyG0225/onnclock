const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { Prisma } = require('@prisma/client')

// Transpile the actual TypeScript modules and inject only infrastructure boundaries.
// No test database, credentials, network, or changes to production data are needed.
function loader(overrides = {}) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name]
      if (name.startsWith('@/')) return load(path.join('src', name.slice(2)) + '.ts')
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts')
      return require(name)
    }
    new Function('require', 'module', 'exports', source)(localRequire, module, module.exports)
    return module.exports
  }
  return load
}

const load = loader()
const { payslipTotals } = load('src/lib/payroll/payslip-totals.ts')
const { deriveDailyRate, deriveHourlyRate } = load('src/lib/payroll/rates.ts')
const { computePayroll } = load('src/lib/payroll/engine.ts')
const { scheduledHourlyPayDays } = load('src/lib/payroll/scheduled-hours.ts')
const { hourlyCalculationBasis } = load('src/lib/payroll/calculation-basis.ts')
const input = () => ({
  employee: {id:'test',basicSalary:150,dailyRate:1200,hourlyRate:150,rateType:'HOURLY',payFrequency:'SEMI_MONTHLY',isMinimumWageEarner:false,isExemptFromTax:true,sssEnabled:false,philhealthEnabled:false,pagibigEnabled:false,withholdingTaxEnabled:false},
  period: {start:new Date('2026-09-26'),end:new Date('2026-10-10'),workingDays:10,payFrequency:'SEMI_MONTHLY',isFirstCutoff:false,nightDifferentialRate:.1,workHoursPerDay:8,workingDaysPerMonth:22},
  attendance: {daysWorked:4,regularHours:19,scheduledHours:19,regularOtHours:0,restDayOtHours:0,regularHolidayOtHours:0,specialHolidayOtHours:0,nightDiffHours:0,lateMinutes:0,undertimeMinutes:0,absentDays:0,regularHolidaysWorked:0,specialHolidaysWorked:0},
  loans:[],deMinimis:{riceSubsidy:0,clothing:0,medical:0,laundry:0,meal:0,other:0},allowances:{rice:0,clothing:0,medical:0,transportation:0,other:0},additionalTaxableIncome:0,additionalNonTaxableIncome:0,ytd:{grossPay:0,taxableIncome:0,withholdingTax:0,thirteenthMonthContrib:0}
})
test('manual recompute excludes employer EC and does not duplicate non-taxable income',()=>{
  assert.deepEqual(payslipTotals({basicSalary:2850,otherEarnings:1500,otherAllowances:1500,sssEmployee:350,sssEc:15,philhealthEmployee:125,pagibigEmployee:100,lateDeduction:25}), {grossPay:4350,totalDeductions:600,netPay:3750})
})
test('all stored employee deduction components reconcile including loans and custom adjustments',()=>{
  const v={basicSalary:1000,regularOtAmount:25,restDayOtAmount:30,holidayOtAmount:40,nightDiffAmount:5,holidayPayAmount:100,riceAllowance:10,clothingAllowance:10,medicalAllowance:10,otherEarnings:20,sssEmployee:10,philhealthEmployee:10,pagibigEmployee:10,withholdingTax:10,sssLoanDeduction:10,pagibigLoan:10,companyLoan:10,lateDeduction:10,undertimeDeduction:10,absenceDeduction:10,otherDeductions:10}
  assert.deepEqual(payslipTotals(v),{grossPay:1250,totalDeductions:110,netPay:1140})
})
test('effective rates use the same configured divisors as payroll instead of cached rates',()=>{
  const e={basicSalary:26000,dailyRate:1181.82,hourlyRate:147.73,rateType:'MONTHLY'}
  const b={workHoursPerDay:6,workingDaysPerMonth:26}
  assert.equal(deriveDailyRate(e,b),1000)
  assert.equal(deriveHourlyRate(e,b),1000/6)
})
test('Pag-IBIG employer share remains 2% in the employee 1% tier',()=>{
  const v=input();v.employee.basicSalary=10;v.employee.pagibigEnabled=true;v.attendance.daysWorked=1;v.attendance.regularHours=8;v.attendance.scheduledHours=8
  const r=computePayroll(v);assert.equal(r.pagibigEmployee,.8);assert.equal(r.pagibigEmployer,1.6)
})

const date = new Date('2026-10-01T00:00:00Z')
const attendance = (extra={}) => ({date,isAbsent:false,isLeave:false,isLeavePaid:false,...extra})
const assignment = (timeIn,timeOut,schedule=null,extra={}) => ({date,timeIn,timeOut,schedule,isRestDay:false,...extra})
const scheduleInput = (assignments, extra={}) => ({attendance:[attendance()],assignments,defaultSchedule:null,trackTime:true,start:date,end:date,...extra})
test('short lesson ignores stale eight-hour template and short-block break',()=>{
  const r=scheduledHourlyPayDays(scheduleInput([assignment('09:00','11:00',{timeIn:'09:00',timeOut:'11:00',workHoursPerDay:8,breakMinutes:60})]))
  assert.equal(r.hours,2);assert.deepEqual(r.errors,[])
})
test('multiple lesson sessions exclude unpaid gaps and duplicate attendance dates',()=>{
  const r=scheduledHourlyPayDays(scheduleInput([assignment('09:00','11:00'),assignment('13:00','16:00')],{attendance:[attendance(),attendance()]}))
  assert.equal(r.hours,5);assert.equal(r.days.length,1)
})
test('full scheduled hours form basic; late and undertime are deducted once',()=>{
  const v=input();const r=scheduledHourlyPayDays(scheduleInput([assignment('09:00','11:00'),assignment('13:00','16:00')]))
  v.attendance.scheduledHours=r.hours;v.attendance.regularHours=4.5;v.attendance.lateMinutes=15;v.attendance.undertimeMinutes=15
  const result=computePayroll(v)
  assert.equal(result.basicPay,750);assert.equal(result.lateDeduction,37.5);assert.equal(result.undertimeDeduction,37.5);assert.equal(result.netPay,675)
})
test('overnight and configured unpaid meal break resolve correctly',()=>{
  const r=scheduledHourlyPayDays(scheduleInput([assignment('22:00','07:00',{timeIn:null,timeOut:null,breakMinutes:60,breakEnabled:true})]))
  assert.equal(r.hours,8)
})
test('break-disabled long session pays full scheduled span',()=>{
  const r=scheduledHourlyPayDays(scheduleInput([assignment('09:00','15:00',{timeIn:null,timeOut:null,breakMinutes:60,breakEnabled:false})]))
  assert.equal(r.hours,6)
})
test('absence and unpaid leave receive no hourly basic; paid half-day gets half schedule',()=>{
  const sessions=[assignment('09:00','13:00')]
  assert.equal(scheduledHourlyPayDays(scheduleInput(sessions,{attendance:[attendance({isAbsent:true})]})).hours,0)
  assert.equal(scheduledHourlyPayDays(scheduleInput(sessions,{attendance:[attendance({isLeave:true})]})).hours,0)
  assert.equal(scheduledHourlyPayDays(scheduleInput(sessions,{attendance:[attendance({isLeave:true,isLeavePaid:true,isHalfDay:true})]})).hours,2)
})
test('missing and overlapping lessons require correction instead of inventing eight hours',()=>{
  assert.match(scheduledHourlyPayDays(scheduleInput([])).errors[0],/no payable schedule/)
  assert.match(scheduledHourlyPayDays(scheduleInput([assignment('09:00',null)])).errors[0],/incomplete/)
  assert.match(scheduledHourlyPayDays(scheduleInput([assignment('09:00','12:00'),assignment('11:00','13:00')])).errors[0],/overlapping/)
})
test('default schedule and per-day override use explicit clock ranges',()=>{
  const defaultSchedule={timeIn:'09:00',timeOut:'18:00',breakMinutes:60,workHoursPerDay:8}
  assert.equal(scheduledHourlyPayDays(scheduleInput([],{defaultSchedule})).hours,8)
  assert.equal(scheduledHourlyPayDays(scheduleInput([assignment('10:00','12:00')],{defaultSchedule})).hours,2)
})
test('explicit zero scheduled hours never falls back to recorded hours',()=>{
  const v=input();v.attendance.scheduledHours=0
  assert.equal(computePayroll(v).basicPay,0)
})
test('snapshot daily centavos reconcile exactly and preserve original rates',()=>{
  const days=[1,2,3].map(i=>({date:`2026-10-0${i}`,hours:1/60,source:'assignment'}))
  const b=hourlyCalculationBasis(100,days)
  assert.deepEqual(b.days.map(d=>d.amount),[1.67,1.66,1.67]);assert.equal(b.computedBasicPay,5)
  days[0].hours=8;assert.equal(b.days[0].hours,1/60)
})
test('non-clocked hourly employees follow scheduled dates, not generic weekday count',()=>{
  const r=scheduledHourlyPayDays(scheduleInput([assignment('09:00','11:00')],{attendance:[],trackTime:false}))
  assert.equal(r.hours,2)
  assert.ok(scheduledHourlyPayDays(scheduleInput([],{attendance:[],trackTime:false})).errors.length)
})

const { mandatoryContributions } = load('src/lib/payroll/mandatory-contributions.ts')
const mandatoryInput = (extra={}) => ({earned:15000,monthlyBasic:30000,frequency:'SEMI_MONTHLY',monthlyOnly:false,firstCutoff:true,...extra})
const priorMandatory = (result, compensation, periods=1) => ({...result,compensation,periods})
test('uneven cutoffs settle SSS and Pag-IBIG on actual monthly compensation',()=>{
 const first=mandatoryContributions(mandatoryInput());
 const second=mandatoryContributions(mandatoryInput({earned:5000,firstCutoff:false,prior:priorMandatory(first,15000)}));
 assert.equal(first.sssEmployee,750);assert.equal(second.sssEmployee,250);
 assert.equal(first.sssEmployer+second.sssEmployer,2000);
 assert.equal(first.sssEc+second.sssEc,30);
 assert.equal(first.pagibigEmployee+second.pagibigEmployee,200);
 assert.equal(first.philhealthEmployee+second.philhealthEmployee,750);
});
test('monthly collection uses both actual cutoffs instead of stored salary',()=>{
 const first=mandatoryContributions(mandatoryInput({earned:3000,monthlyOnly:true}));
 const second=mandatoryContributions(mandatoryInput({earned:4000,monthlyOnly:true,firstCutoff:false,prior:priorMandatory(first,3000)}));
 assert.equal(first.sssEmployee,0);assert.equal(second.sssEmployee,350);
 assert.equal(second.pagibigEmployee,140);assert.equal(second.philhealthEmployee,750);
});
test('zero earnings never fall back to the employee contractual salary',()=>{
 const result=mandatoryContributions(mandatoryInput({earned:0,monthlyBasic:100000}));
 assert.ok(Object.values(result).every(amount=>amount===0));
});
test('zero second-cutoff earnings still reconcile earlier earnings and contributions',()=>{
 const first=mandatoryContributions(mandatoryInput({earned:2000}));
 const last=mandatoryContributions(mandatoryInput({earned:0,firstCutoff:false,prior:priorMandatory(first,2000)}));
 assert.equal(first.sssEmployee+last.sssEmployee,250);
 assert.equal(first.pagibigEmployee+last.pagibigEmployee,40);
});
test('fifth weekly payroll does not duplicate monthly capped contributions',()=>{
 let prior={compensation:0,periods:0,sssEmployee:0,sssEmployer:0,sssEc:0,philhealthEmployee:0,philhealthEmployer:0,pagibigEmployee:0,pagibigEmployer:0};
 for(let i=0;i<5;i++){
  const result=mandatoryContributions(mandatoryInput({earned:15000,frequency:'WEEKLY',prior}));
  for(const key of Object.keys(result))prior[key]+=result[key];
  prior.compensation+=15000;prior.periods++;
 }
 assert.equal(prior.sssEmployee,1750);assert.equal(prior.sssEmployer,3500);assert.equal(prior.sssEc,30);
 assert.equal(prior.pagibigEmployee,200);assert.equal(prior.philhealthEmployee,750);
});
test('attendance losses reduce compensation contributions but not PhilHealth monthly basic',()=>{
 const v=input();v.employee.rateType='MONTHLY';v.employee.basicSalary=30000;v.employee.sssEnabled=true;v.employee.philhealthEnabled=true;v.employee.pagibigEnabled=true;
 v.attendance.daysWorked=11;v.attendance.scheduledHours=88;v.attendance.regularHours=88;v.period.isFirstCutoff=true;
 const full=computePayroll(v);v.attendance.lateMinutes=2400;const reduced=computePayroll(v);
 assert.ok(reduced.sssEmployee<full.sssEmployee);assert.equal(reduced.philhealthEmployee,full.philhealthEmployee);
});
test('recompute with identical prior cutoffs produces identical contributions',()=>{
 const first=mandatoryContributions(mandatoryInput());const args=mandatoryInput({earned:5000,firstCutoff:false,prior:priorMandatory(first,15000)});
 assert.deepEqual(mandatoryContributions(args),mandatoryContributions(args));
});

const { allocateDeductions, readDeductionCarryover } = load('src/lib/payroll/deduction-carryover.ts')
test('partial installment is collected only from pay left after statutory and attendance deductions', () => {
  const r = allocateDeductions({basicSalary:1000,sssEmployee:200,lateDeduction:100}, [{id:'a',type:'COMPANY_LOAN',amount:900}], 300)
  assert.equal(r.deductions.companyLoan,700)
  assert.equal(r.totals.netPay,0)
  assert.equal(r.carryover.loans[0].deferred,200)
  assert.equal(r.carryover.otherDeferred,300)
  assert.equal(r.carryover.deferredTotal,500)
})
test('multiple loans share one budget and zero-pay cycles preserve every unpaid amount', () => {
  const loans=[{id:'a',type:'SSS_SALARY',amount:700},{id:'b',type:'PAGIBIG',amount:600},{id:'c',type:'CASH_ADVANCE',amount:200}]
  const r=allocateDeductions({basicSalary:1000},loans,50)
  assert.deepEqual(r.deductions,{sssLoanDeduction:700,pagibigLoan:300,companyLoan:0,otherDeductions:0})
  const zero=allocateDeductions({},loans,50)
  assert.equal(zero.totals.netPay,0)
  assert.equal(zero.carryover.deferredTotal,1550)
})
test('next payroll collects arrears plus new dues and clears fully recovered carryover',()=>{
  const first=allocateDeductions({basicSalary:500},[{id:'a',type:'COMPANY_LOAN',amount:1000}],200)
  const next=allocateDeductions({basicSalary:3000},[{id:'a',type:'COMPANY_LOAN',amount:1000+first.carryover.loans[0].deferred}],200+first.carryover.otherDeferred,first.carryover.otherDeferred)
  assert.equal(next.deductions.companyLoan,1500)
  assert.equal(next.deductions.otherDeductions,400)
  assert.equal(next.totals.netPay,1100)
  assert.equal(next.carryover.deferredTotal,0)
})
test('repeated allocation and centavo amounts reconcile without accumulating debt',()=>{
  const args=[{basicSalary:100.01},[{id:'a',type:'COMPANY_LOAN',amount:99.99}],.03]
  const r=allocateDeductions(...args)
  assert.equal(r.deductions.otherDeductions,.02)
  assert.equal(r.carryover.otherDeferred,.01)
  assert.equal(r.totals.netPay,0)
  assert.deepEqual(allocateDeductions(...args),r)
  assert.deepEqual(readDeductionCarryover({deductionCarryover:r.carryover}),r.carryover)
})
test('statutory-only shortfalls stay visible and are not disguised as a loan deferral',()=>{
  const r=allocateDeductions({basicSalary:100,sssEmployee:200},[{id:'a',type:'COMPANY_LOAN',amount:50}],20)
  assert.equal(r.totals.netPay,-100)
  assert.equal(r.carryover.deferredTotal,70)
  assert.equal(r.deductions.companyLoan,0)
})
test('engine caps the combined loan deduction rather than checking each loan against gross',()=>{
  const i=input(); i.loans=[{id:'a',type:'COMPANY_LOAN',amount:2000},{id:'b',type:'COMPANY_LOAN',amount:2000}]
  const r=computePayroll(i)
  assert.equal(r.loanDeductions,2850)
  assert.equal(r.netPay,0)
})
test('manual adjustment updates actual repayments atomically and repeats without duplicate debit',async()=>{
  const initial=allocateDeductions({basicSalary:1000,sssEmployee:200},[{id:'loan',type:'COMPANY_LOAN',amount:1500}],400)
  const fields=['basicSalary','regularOtAmount','restDayOtAmount','holidayOtAmount','nightDiffAmount','holidayPayAmount','riceAllowance','clothingAllowance','medicalAllowance','otherAllowances','otherEarnings','sssEmployee','sssEc','philhealthEmployee','pagibigEmployee','withholdingTax','sssLoanDeduction','pagibigLoan','companyLoan','lateDeduction','undertimeDeduction','absenceDeduction','otherDeductions']
  const state={...Object.fromEntries(fields.map(k=>[k,new Prisma.Decimal(0)])),basicSalary:new Prisma.Decimal(1000),sssEmployee:new Prisma.Decimal(200),companyLoan:new Prisma.Decimal(800),manualEdits:{},calculationBasis:{deductionCarryover:initial.carryover},employee:{rateType:'HOURLY'}}
  let ledger=[{loanId:'loan',amount:new Prisma.Decimal(800),loan:{loanType:'COMPANY_LOAN'}}]
  let balance=4200
  let blocked=false
  const run={status:'COMPUTED',payDate:new Date('2026-10-15'),periodEnd:new Date('2026-10-10'),createdAt:new Date('2026-10-01')}
  const tx={
    $executeRaw:async()=>0,
    $queryRaw:async()=>[],
    payslip:{
      findFirst:async q=>q.where.id?{id:'ps',employeeId:'e',payrollRunId:'r',payrollRun:run,employee:{firstName:'Test',lastName:'Person'}}:blocked?{id:'later'}:null,
      findUniqueOrThrow:async()=>({...state,loanDeductions:ledger}),
      update:async({data})=>{for(const [key,v]of Object.entries(data))state[key]=typeof v==='number'?new Prisma.Decimal(v):v;return state},
      aggregate:async()=>({_sum:{grossPay:state.grossPay,totalDeductions:state.totalDeductions,netPay:state.netPay}}),
    },
    employeeLoan:{update:async({data})=>{balance=typeof data.balance==='number'?data.balance:balance+Number(data.balance.increment)},findUniqueOrThrow:async()=>({balance:new Prisma.Decimal(balance)})},
    payslipLoanDeduction:{deleteMany:async()=>{ledger=[]},create:async({data})=>{ledger.push({...data,amount:new Prisma.Decimal(data.amount),loan:{loanType:'COMPANY_LOAN'}})}},
    payrollRun:{update:async()=>({})},
  }
  const db={$transaction:async fn=>fn(tx)}
  const isolated=loader({'@/lib/prisma':{prisma:db},'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>true},'@/lib/audit':{logAudit:async()=>{}}})
  const {PATCH}=isolated('src/app/api/payroll/payslip/[payslipId]/route.ts')
  const edit=async (salary, extra={})=>{const response=await PATCH({json:async()=>({basicSalary:salary,...extra})},{params:Promise.resolve({payslipId:'ps'})});return {status:response.status,body:await response.json()}}
  const lower=await edit(600)
  assert.equal(lower.status,200)
  assert.equal(lower.body.companyLoan,400)
  assert.equal(lower.body.netPay,0)
  assert.equal(balance,4600)
  assert.equal(state.calculationBasis.deductionCarryover.loans[0].deferred,1100)
  await edit(600)
  assert.equal(balance,4600)
  const higher=await edit(2500)
  assert.equal(higher.body.companyLoan,1500)
  assert.equal(higher.body.otherDeductions,400)
  assert.equal(higher.body.netPay,400)
  assert.equal(balance,3500)
  assert.equal(state.calculationBasis.deductionCarryover.deferredTotal,0)
  state.calculationBasis.calculatedValues={basicSalary:1000,sssEmployee:200}
  const reset=await edit(700,{resetFields:['basicSalary'],adjustmentReason:'Restore scheduled pay'})
  assert.equal(reset.status,200)
  assert.equal(Number(state.basicSalary),1000)
  assert.equal(state.manualEdits.basicSalary,undefined)
  assert.equal(state.manualEdits.adjustmentReason,'Restore scheduled pay')
  assert.equal(balance,4200)
  assert.equal((await edit(500,{resetFields:['withholdingTax'],adjustmentReason:'Reset missing snapshot'})).status,422)
  assert.equal(balance,4200)
  blocked=true
  assert.equal((await edit(100)).status,409)
  assert.equal(balance,4200)
})

test('employee ND exclusion zeros pay without changing recorded night hours or basic pay',()=>{
 const data=input();data.attendance.nightDiffHours=8
 const enabled=computePayroll(data)
 assert.equal(enabled.nightDiffAmount,120)
 data.employee.disableNightDifferential=true
 const disabled=computePayroll(data)
 assert.equal(disabled.nightDiffAmount,0)
 assert.equal(disabled.basicPay,enabled.basicPay)
 assert.equal(enabled.grossPay-disabled.grossPay,120)
 assert.equal(data.attendance.nightDiffHours,8)
 data.rateAmounts={basicPay:2850,regularOtAmount:0,restDayOtAmount:0,holidayOtAmount:0,nightDiffAmount:250,holidayPayAmount:0,lateDeduction:0,undertimeDeduction:0,absenceDeduction:0}
 assert.equal(computePayroll(data).nightDiffAmount,0)
 data.employee.disableNightDifferential=false
 assert.equal(computePayroll(data).nightDiffAmount,250)
})
