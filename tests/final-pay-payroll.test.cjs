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

function fixture(options={}){
 let slips=[],run=options.existing?{id:'r',companyId:'c',status:'COMPUTED',runType:'REGULAR',employeeIds:[],employeeScopeMode:'ALL',payDate:new Date('2026-12-15')}:null,updates=[];
 const statement={reviewHash:'a'.repeat(64),snapshot:{outstandingLoans:100,cashAdvanceBalance:0},result:{dailyRate:1000,grossPay:2000,totalDeductions:100,taxWithheld:50,netFinalPay:1850,taxableEarnings:2000,nonTaxableEarnings:0,components:[{label:'Unpaid wages',amount:2000}]}};
 const tx={$executeRaw:async()=>{},$queryRaw:async()=>[],company:{findUniqueOrThrow:async()=>({payrollCurrency:'PHP'})},payslip:{findFirst:async({where})=>{assert.equal(where.payrollRun.companyId,'c');return slips[0]?{payrollRunId:run.id,calculationBasis:slips[0].calculationBasis}:options.duplicate?{payrollRunId:'old',calculationBasis:{requestId:'old'}}:null},findUnique:async()=>options.employeeExists?{id:'other'}:null,create:async({data})=>{slips.push(data);return data},aggregate:async({where})=>({_sum:where.payrollRunId?{basicSalary:10000,grossPay:12000,totalDeductions:150,netPay:11850}:{grossPay:0,taxableIncome:0,withholdingTax:0}})},payrollRun:{create:async({data})=>{run={id:'new',...data};return run},findFirst:async({where})=>{assert.equal(where.companyId,'c');assert.equal(where.status,'COMPUTED');assert.equal(where.computationStartedAt,null);return options.unavailable?null:run},updateMany:async({where,data})=>{assert.equal(where.status,'COMPUTED');updates.push(data);return{count:1}}}};
 const api=loader({'../route':{POST:async()=>({ok:true,json:async()=>({...statement,...(options.changed?{reviewHash:'b'.repeat(64)}:{})})})},'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c',userId:'u',role:'COMPANY_ADMIN'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>!options.readOnly},'@/lib/prisma':{prisma:{$transaction:async f=>f(tx)}},'@/lib/audit':{logAudit:async()=>{}}})('src/app/api/final-pay/payroll/route.ts');
 const body={requestId:'a2c091df-7fc4-4cf2-982a-4c6168776a56',reviewed:true,reviewHash:statement.reviewHash,payDate:'2026-12-15',input:{employeeId:'e',lastWorkingDay:'2026-12-01',reason:'RESIGNATION'},...(options.existing?{runId:'r'}:{})};
 return{body,post:patch=>api.POST({url:'https://example.com/api/final-pay/payroll',headers:{},json:async()=>({...body,...patch})}),slips,updates,get run(){return run}};
}
test('new final payroll saves itemized earnings and deductions, without recurring deductions',async()=>{const f=fixture();assert.equal((await f.post()).status,201);assert.equal(f.run.runType,'FINAL_PAY');assert.equal(f.run.status,'COMPUTED');assert.equal(f.slips[0].netPay,1850);assert.equal(f.slips[0].totalDeductions,150);assert.equal(f.slips[0].manualEdits.customIncomes[0].label,'Unpaid wages');assert.equal(f.slips[0].manualEdits.customDeductions[0].amount,100);assert.equal(f.slips[0].sssEmployee,undefined)});
test('retry is idempotent and a separate attempt cannot duplicate final pay',async()=>{const f=fixture();await f.post();assert.equal((await f.post()).status,200);assert.equal(f.slips.length,1);assert.equal((await f.post({requestId:'b2c091df-7fc4-4cf2-982a-4c6168776a56'})).status,409)});
test('existing computed run retains other payroll totals when adding final pay',async()=>{const f=fixture({existing:true});assert.equal((await f.post()).status,201);assert.equal(f.slips[0].payrollRunId,'r');assert.equal(f.updates[0].totalGross,12000)});
test('read-only, missing review, changed source, duplicate employee and unavailable run rejected',async()=>{assert.equal((await fixture({readOnly:true}).post()).status,403);assert.equal((await fixture().post({reviewed:false})).status,422);for(const options of [{changed:true},{duplicate:true},{existing:true,employeeExists:true},{existing:true,unavailable:true}]){const f=fixture(options);assert.equal((await f.post()).status,409);assert.equal(f.slips.length,0)}});
test('invalid or premature payment dates rejected',async()=>{for(const payDate of ['2026-02-30','2026-11-30'])assert.equal((await fixture().post({payDate})).status,422)});
test('negative final pay and inconsistent deductions rejected by mapping',()=>{const {finalPayPayslip}=loader()('src/lib/payroll/final-pay-transfer.ts');assert.throws(()=>finalPayPayslip({netFinalPay:-1,grossPay:1},{outstandingLoans:0,cashAdvanceBalance:0},0));assert.throws(()=>finalPayPayslip({netFinalPay:1,grossPay:10,totalDeductions:3},{outstandingLoans:2,cashAdvanceBalance:0},0))});
