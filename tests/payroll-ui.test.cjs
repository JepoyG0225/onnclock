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
const common = {
  '@/components/auth/PermissionsProvider':{usePermissions:()=>['payroll:read','payroll:write']},
  'next/navigation':{useRouter:()=>({refresh(){},push(){}}),redirect(){throw new Error('Unexpected redirect')}},
  'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
  '@/hooks/useCurrency':{useCurrency:()=>({fmt:n=>`PHP ${n.toFixed(2)}`,symbol:()=> 'PHP'})},
  '@/components/ui/confirm-dialog':{ConfirmDialog:()=>null},
}
const load=loader(common)
const { readCalculatedValues,readCalculatedAt }=load('src/lib/payroll/review.ts')
test('legacy and malformed baselines cannot be used as calculated overrides',()=>{
  assert.deepEqual(readCalculatedValues(null),{})
  assert.deepEqual(readCalculatedValues({calculatedValues:{basicSalary:1200,sssEmployee:'200',companyLoan:123}}),{basicSalary:1200})
  assert.equal(readCalculatedAt({calculatedAt:'invalid'}),null)
})
function sampleRow() { return {id:'p',basicSalary:1000,grossPay:1000,netPay:800,totalDeductions:200,sssEmployee:200,sssEc:0,philhealthEmployee:0,pagibigEmployee:0,withholdingTax:0,sssLoanDeduction:0,pagibigLoan:0,companyLoan:0,lateDeduction:0,undertimeDeduction:0,absenceDeduction:0,otherDeductions:0,regularOtAmount:0,restDayOtAmount:0,holidayOtAmount:0,nightDiffAmount:0,holidayPayAmount:0,otherEarnings:0,customIncomes:[],customDeductions:[],incomes:[],employee:{id:'e',firstName:'Test',lastName:'Employee',employeeNo:'EMP-1',rateType:'HOURLY',department:{name:'Training'},position:null}} }
test('review table defaults to a compact view with matching totals columns and named actions',()=>{
  const {PayrollRunPayslips}=load('src/components/payroll/PayrollRunPayslips.tsx')
  const row=sampleRow()
  const html=renderToStaticMarkup(React.createElement(PayrollRunPayslips,{payslips:[row],runStatus:'COMPUTED',totalBasic:1000,totalGross:1000,totalDeductions:200,totalNetPay:800}))
  assert.match(html,/View basic pay computation for Test Employee/)
  assert.match(html,/aria-haspopup="dialog"/)
  assert.match(html,/Find an employee/)
  assert.match(html,/With carryovers/)
  assert.match(html,/Show detailed columns/)
  const header=html.match(/<thead>([\s\S]*?)<\/thead>/)[1]
  assert.equal((header.match(/<th /g)||[]).length,8)
  assert.doesNotMatch(header,/PhilHealth/)
  assert.match(html,/Entire run net pay/)
  assert.match(html,/aria-label="Adjust pay for Test Employee"/)
  assert.match(html,/aria-expanded="false"/)
  assert.match(html,/mobile-detail-p/)
  assert.match(html,/PHP 800.00/)
})
test('review-only users receive no adjustment or removal controls',()=>{
  const {PayrollRunPayslips}=load('src/components/payroll/PayrollRunPayslips.tsx')
  const html=renderToStaticMarkup(React.createElement(PayrollRunPayslips,{payslips:[sampleRow()],runStatus:'COMPUTED',allowEdits:false}))
  assert.doesNotMatch(html,/Adjust pay for|Remove .* from payroll/)
})
test('journey keeps approval distinct from payment and does not offer payment before approval',()=>{
  const {PayrollJourney}=load('src/components/payroll/PayrollJourney.tsx')
  const html=renderToStaticMarkup(React.createElement(PayrollJourney,{runId:'r',status:'COMPUTED',stage:'review'}))
  assert.match(html,/Calculate &amp; Review/)
  assert.match(html,/Approval/)
  assert.match(html,/Disbursed/)
  assert.doesNotMatch(html,/href="\/disbursement"/)
  const approved=renderToStaticMarkup(React.createElement(PayrollJourney,{runId:'r',status:'APPROVED',stage:'approval'}))
  assert.doesNotMatch(approved,/href="\/disbursement"/)
})
test('history filters stay tenant-scoped and page links preserve the filters',async()=>{
  let countQuery,findQuery
  const local=loader({...common,
    '@/lib/auth':{auth:async()=>({user:{id:'u'}})},
    '@/lib/effective-company':{resolveEffectiveCompanyId:async()=> 'company-a'},
    '@/lib/prisma':{prisma:{payrollRun:{count:async q=>{countQuery=q;return 41},findMany:async q=>{findQuery=q;return []}}}},
  })
  const Page=local('src/app/(dashboard)/payroll/page.tsx').default
  const tree=await Page({searchParams:Promise.resolve({q:'Tutors',status:'COMPUTED',payDate:'2026-10-15',page:'2'})})
  const html=renderToStaticMarkup(tree)
  assert.equal(countQuery.where.companyId,'company-a')
  assert.equal(findQuery.where.status,'COMPUTED')
  assert.equal(findQuery.skip,20)
  assert.equal(findQuery.take,20)
  assert.equal(findQuery.where.payDate.toISOString(),'2026-10-15T00:00:00.000Z')
  assert.match(html,/q=Tutors&amp;status=COMPUTED&amp;payDate=2026-10-15&amp;page=3/)
  assert.match(html,/Page 2 of 3/)
})

test('summary navigation is labeled as review rather than payroll execution',()=>{
  const {ProcessPayrollButton}=load('src/components/payroll/ProcessPayrollButton.tsx')
  const html=renderToStaticMarkup(React.createElement(ProcessPayrollButton,{runId:'r'}))
  assert.match(html,/Review Payroll Summary/)
  assert.doesNotMatch(html,/>Process Payroll</)
})

test('employee search and review filters identify the right rows without modifying amounts',()=>{
  const {matchesPayrollReview}=load('src/lib/payroll/review.ts')
  const row=sampleRow()
  const before=JSON.stringify(row)
  assert.equal(matchesPayrollReview(row,'training','all',false),true)
  assert.equal(matchesPayrollReview(row,' employee test ','all',false),true)
  assert.equal(matchesPayrollReview(row,'EMP-1','issues',false),false)
  assert.equal(matchesPayrollReview(row,'EMP-1','issues',true),true)
  assert.equal(matchesPayrollReview(row,'','zero',false),false)
  assert.equal(matchesPayrollReview({...row,netPay:0},'','zero',false),true)
  assert.equal(matchesPayrollReview({...row,customDeductions:[{label:'Uniform',amount:100}]},'','adjusted',false),true)
  assert.equal(matchesPayrollReview({...row,calculationBasis:{deductionCarryover:{version:1,loans:[],deferredTotal:100}}},'','carryover',false),true)
  assert.equal(matchesPayrollReview({...row,calculationBasis:{previousPay:{grossPay:1000,totalDeductions:100,netPay:900}}},'','changed',false),true)
  assert.equal(JSON.stringify(row),before)
})

test('basic-pay popup reconciles scheduled hours, calculated pay and a manual override',()=>{
  const {BasicPayComputation}=load('src/components/payroll/BasicPayComputationDialog.tsx')
  const {hourlyCalculationBasis}=load('src/lib/payroll/calculation-basis.ts')
  const row={...sampleRow(),basicSalary:350,basicPayManuallyEdited:true,calculationBasis:{...hourlyCalculationBasis(150,[{date:'2026-10-01',hours:1,source:'assignment'},{date:'2026-10-02',hours:1,source:'assignment'}]),calculatedValues:{basicSalary:300}}}
  const html=renderToStaticMarkup(React.createElement(BasicPayComputation,{payslip:row,dtrs:[],formatAmount:n=>`PHP ${n.toFixed(2)}`}))
  assert.match(html,/2026-10-01/)
  assert.match(html,/2026-10-02/)
  assert.match(html,/PHP 300.00/)
  assert.match(html,/Manual basic-pay adjustment/)
  assert.match(html,/PHP 50.00/)
  assert.match(html,/PHP 350.00/)
  assert.match(html,/not deducted again/)
})
test('legacy basic-pay popup distinguishes reference counters from the original calculation',()=>{
  const {BasicPayComputation}=load('src/components/payroll/BasicPayComputationDialog.tsx')
  const row={...sampleRow(),dailyRate:100,daysWorked:8,hoursWorked:64}
  const html=renderToStaticMarkup(React.createElement(BasicPayComputation,{payslip:row,dtrs:[],formatAmount:n=>`PHP ${n.toFixed(2)}`}))
  assert.match(html,/complete daily calculation snapshot is not available/)
  assert.match(html,/PHP 800.00/)
  assert.match(html,/PHP 1000.00/)
  assert.doesNotMatch(html,/Manual basic-pay adjustment/)
})

const {dailyBreakdown}=load('src/lib/payroll/daily-breakdown.ts')
const day=(date,extra={})=>({date:new Date(date),isAbsent:false,isLeave:false,isLeavePaid:false,isHoliday:false,holidayType:null,...extra})
const dailyInput=(extra={})=>({attendance:[],holidays:[],hourlyDays:null,holidayHours:{},rateType:'MONTHLY',dailyRate:100.125,hourlyRate:12.515625,workHours:8,trackTime:true,start:new Date('2026-10-01'),end:new Date('2026-10-05'),disableHoliday:false,basicTotal:0,premiumTotal:0,...extra})
test('daily snapshot preserves dates, paid leave, half days and centavo totals',()=>{
 const input=dailyInput({attendance:[day('2026-10-03',{isLeave:true,isLeavePaid:true}),day('2026-10-01'),day('2026-10-02',{isHalfDay:true}),day('2026-10-04',{isAbsent:true})],basicTotal:250.31})
 const result=dailyBreakdown(input)
 assert.equal(result.basicDifference,0)
 assert.deepEqual(result.rows.map(r=>r.date),['2026-10-01','2026-10-02','2026-10-03','2026-10-04'])
 assert.equal(result.rows[1].basic,50.06)
 assert.equal(result.rows[2].status,'Paid leave')
 assert.equal(result.rows[3].basic,0)
 input.attendance[0].isLeavePaid=false
 assert.equal(result.rows[2].status,'Paid leave')
})
test('daily holiday credit belongs in basic; worked premium stays separate',()=>{
 const result=dailyBreakdown(dailyInput({rateType:'DAILY',dailyRate:100,attendance:[day('2026-10-01',{isHoliday:true,holidayType:'REGULAR'})],holidays:[{date:new Date('2026-10-01'),name:'Holiday A',type:'REGULAR'},{date:new Date('2026-10-02'),name:'Holiday B',type:'REGULAR'}],basicTotal:200,premiumTotal:100}))
 assert.equal(result.basicDifference,0);assert.equal(result.premiumDifference,0)
 assert.equal(result.rows[0].premium,100);assert.equal(result.rows[1].holidayCredit,100)
 const {BasicPayComputation}=load('src/components/payroll/BasicPayComputationDialog.tsx')
 const html=renderToStaticMarkup(React.createElement(BasicPayComputation,{payslip:{...sampleRow(),basicSalary:200,calculationBasis:{dailyBreakdown:result}},dtrs:[],formatAmount:n=>`PHP ${n.toFixed(2)}`}))
 assert.match(html,/Holiday B/);assert.match(html,/2026-10-02/);assert.match(html,/Holiday premium \(separate\)/)
})
test('hourly basic uses scheduled hours while holiday premium uses actual hours',()=>{
 const result=dailyBreakdown(dailyInput({rateType:'HOURLY',hourlyRate:150,attendance:[day('2026-10-01',{isHoliday:true,holidayType:'REGULAR'})],hourlyDays:[{date:'2026-10-01',hours:4,source:'assignment'}],holidayHours:{'2026-10-01':3},basicTotal:600,premiumTotal:450}))
 assert.equal(result.rows[0].basic,600);assert.equal(result.rows[0].premium,450)
 assert.equal(result.basicDifference,0);assert.equal(result.premiumDifference,0)
})
test('nonclocked fallback is never represented as actual attendance',()=>{
 const result=dailyBreakdown(dailyInput({trackTime:false,basicTotal:300.38}))
 assert.equal(result.rows.length,3)
 assert.ok(result.rows.every(r=>r.status.includes('no attendance record')))
 assert.equal(result.basicDifference,0)
})

test('separate holiday shifts retain their own actual premium hours',()=>{
 const result=dailyBreakdown(dailyInput({rateType:'HOURLY',hourlyRate:150,attendance:[day('2026-10-01',{id:'a',isHoliday:true,holidayType:'REGULAR'}),day('2026-10-01',{id:'b',isHoliday:true,holidayType:'REGULAR'})],hourlyDays:[{date:'2026-10-01',hours:5,source:'assignment'}],holidayHours:{a:2,b:3},basicTotal:750,premiumTotal:750}))
 assert.equal(result.rows[0].premium,300);assert.equal(result.rows[1].premium,450)
 assert.equal(result.basicDifference,0);assert.equal(result.premiumDifference,0)
})

test('omitted employees are identified and link to their profile instead of a missing payroll row',()=>{
 const auditLoad=loader({...common,'@/lib/prisma':{prisma:{}}})
 const {findPayrollAnomalies}=auditLoad('src/lib/payroll/anomalies.ts')
 const issues=findPayrollAnomalies({current:[],previous:[{employeeId:'emp-omitted',employeeName:'Jane Santos',employeeNo:'EMP-002',grossPay:1000,netPay:900}],lateMinutesByEmployee:new Map(),dtrCountByEmployee:new Map(),companyLateDeductionsDisabled:false})
 assert.equal(issues[0].employeeName,'Jane Santos (EMP-002)')
 assert.equal(issues[0].reviewHref,'/employees/emp-omitted')
 const {PayrollAnomalyPanel}=load('src/components/payroll/PayrollAnomalyPanel.tsx')
 const html=renderToStaticMarkup(React.createElement(PayrollAnomalyPanel,{anomalies:issues}))
 assert.match(html,/Jane Santos \(EMP-002\)/)
 assert.match(html,/href="\/employees\/emp-omitted"/)
 assert.match(html,/View employee profile/)
 assert.match(html,/payroll-review-blink/)
 assert.doesNotMatch(html,/>Review employee<\/button>/)
})
test('payroll review icon blinks only for warnings and critical issues',()=>{
 const {PayrollAnomalyPanel}=load('src/components/payroll/PayrollAnomalyPanel.tsx')
 const render=anomalies=>renderToStaticMarkup(React.createElement(PayrollAnomalyPanel,{anomalies}))
 assert.doesNotMatch(render([]),/payroll-review-blink/)
 assert.doesNotMatch(render([{key:'new',severity:'info',title:'New employee',detail:'First run'}]),/payroll-review-blink/)
 assert.match(render([{key:'negative',severity:'critical',title:'Negative pay',detail:'Review deductions'}]),/payroll-review-blink/)
})

test('monthly basic-pay popup shows fixed entitlement and saved absence detail',()=>{
 const {BasicPayComputation}=load('src/components/payroll/BasicPayComputationDialog.tsx')
 const row={...sampleRow(),basicSalary:6000,dailyRate:1000,daysWorked:5,hoursWorked:40,absenceDeduction:1000,employee:{...sampleRow().employee,rateType:'MONTHLY'},calculationBasis:{monthlyPay:{version:1,frequency:'WEEKLY',divisor:26,basicPay:6000,absenceDeduction:1000,days:[{date:'2026-11-09',rate:26000,share:12/52,absentDays:1,status:'Absent / unpaid leave'}]},calculatedValues:{basicSalary:6000}}}
 const html=renderToStaticMarkup(React.createElement(BasicPayComputation,{payslip:row,dtrs:[],formatAmount:n=>`PHP ${n.toFixed(2)}`}))
 assert.match(html,/Monthly salary x 12 \/ 52/);assert.match(html,/PHP 6000.00/);assert.match(html,/PHP 1000.00/);assert.match(html,/2026-11-09/);assert.doesNotMatch(html,/Calculation reconciliation requiring review/)
})
