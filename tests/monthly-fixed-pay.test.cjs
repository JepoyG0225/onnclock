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

const {monthlyPayDays,monthlyPayAmounts,earnedBasicPay}=load('src/lib/payroll/monthly-pay.ts')
const {calculateSalary,retroDifference}=load('src/lib/salary/calculation.ts')
for(const [frequency,basic] of [['MONTHLY',26000],['SEMI_MONTHLY',13000],['WEEKLY',6000]]) test(`monthly salary paid ${frequency} retains full basic and deducts attendance once`,()=>{
 const p=input();p.employee.rateType='MONTHLY';p.employee.basicSalary=26000;p.period.payFrequency=frequency;p.period.workingDaysPerMonth=26;
 p.attendance.daysWorked=3;p.attendance.absentDays=1;p.attendance.lateMinutes=30;p.attendance.undertimeMinutes=60;
 const r=computePayroll(p);assert.equal(r.basicPay,basic);assert.equal(r.absenceDeduction,1000);assert.equal(r.lateDeduction,62.5);assert.equal(r.undertimeDeduction,125);assert.equal(r.netPay,basic-1187.5);assert.equal(r.thirteenthMonthContribution,Number(((basic-1187.5)/12).toFixed(2)))
})
test('22-day divisor changes absence price without changing cutoff base',()=>{const p=input();p.employee.rateType='MONTHLY';p.employee.basicSalary=22000;p.attendance.absentDays=.5;const r=computePayroll(p);assert.equal(r.basicPay,11000);assert.equal(r.absenceDeduction,500)})
const base=()=>({start:new Date('2026-11-09'),end:new Date('2026-11-15'),frequency:'WEEKLY',salary:26000,trackTime:true,hireDate:new Date('2020-01-01'),terminationDate:null,workDays:[1,2,3,4,5,6],assignments:[],attendance:[],leaves:[],holidays:[]})
const row=(date,extra={})=>({date:new Date(date),isAbsent:false,isLeave:false,isLeavePaid:false,isHalfDay:false,isRestDay:false,...extra})
test('schedule absences exclude rest days, holidays and paid leave and do not duplicate sessions',()=>{const p=base();p.attendance=[row('2026-11-09'),row('2026-11-09'),row('2026-11-10',{isHalfDay:true})];p.leaves=[{startDate:new Date('2026-11-10'),endDate:new Date('2026-11-10'),isHalfDay:true,leaveType:{isWithPay:true}}];p.holidays=[{date:new Date('2026-11-11')}];p.assignments=[{date:new Date('2026-11-12'),isRestDay:true}];const days=monthlyPayDays(p);assert.deepEqual(days.map(d=>d.absentDays),[0,0,0,0,1,1,0]);assert.deepEqual(monthlyPayAmounts(days,26),{basicPay:6000,absenceDeduction:2000})})
test('unpaid half-day leave and missing scheduled days are deducted; full absence capped at base',()=>{const p=base();p.attendance=[row('2026-11-09',{isHalfDay:true}),row('2026-11-09',{isHalfDay:true,isLeave:true})];const days=monthlyPayDays(p);assert.equal(days[0].absentDays,.5);assert.equal(monthlyPayAmounts(days,22).absenceDeduction,6000)})
test('tracking off retains fixed salary without absence deduction',()=>{const p=base();p.trackTime=false;p.workDays=null;assert.deepEqual(monthlyPayAmounts(monthlyPayDays(p),26),{basicPay:6000,absenceDeduction:0})})
test('partial employment prorates calendar entitlement without charging prehire absence',()=>{const p=base();p.hireDate=new Date('2026-11-12');p.trackTime=false;const days=monthlyPayDays(p);assert.equal(monthlyPayAmounts(days,26).basicPay,3428.57);assert.equal(days[0].absentDays,0)})
test('dated raises update fixed salary and absence at date-specific rates; retro reconciles',()=>{const p=base();const days=monthlyPayDays(p);const snapshot={version:1,rateType:'MONTHLY',divisor:26,hours:8,days:[],monthlyDays:days,amounts:{},changeIds:[]};const before=calculateSalary(snapshot,[]);const after=calculateSalary(snapshot,[{id:'raise',effectiveDate:'2026-11-12',beforeAmount:26000,amount:28600,rateType:'MONTHLY'}]);assert.equal(after.amounts.basicPay,6342.86);assert.equal(after.amounts.absenceDeduction,6300);assert.deepEqual(retroDifference(before,after),{basic:342.86,other:-300,total:42.86})})
test('annual earned basic excludes new attendance deductions but leaves historic snapshots intact',()=>{const p={basicSalary:13000,absenceDeduction:1000,lateDeduction:50,undertimeDeduction:100,calculationBasis:{monthlyPay:{version:1}}};assert.equal(earnedBasicPay(p),11850);assert.equal(earnedBasicPay({...p,calculationBasis:null}),13000)})
