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
function fixture({write=true,short=false,foreign=false,sameEmployee=false}={}){
 const balances=['b1','b2'].map((id,i)=>({id,employeeId:sameEmployee?'e1':`e${i+1}`,entitled:short&&i===1?0:5,carriedOver:0,used:0,pending:0,encashed:0,employee:{isExemptFromTax:false},leaveType:{name:'SIL'}}));let run=null,slips=[],ledger=[];
 const tx={$executeRaw:async()=>{},$queryRaw:async()=>[],company:{findUniqueOrThrow:async()=>({payrollCurrency:'PHP'})},payrollRun:{findUnique:async()=>run?{...run,payslips:slips}:null,create:async({data})=>{run=data;return run}},leaveBalance:{findMany:async({where})=>{assert.equal(where.year,2026);assert.equal(where.employee.companyId,'c');assert.equal(where.leaveType.companyId,'c');assert.equal(where.leaveType.isPaidOut,true);return foreign?balances.slice(0,1):balances},update:async({where,data})=>{balances.find(b=>b.id===where.id).encashed+=data.encashed.increment}},incomeType:{upsert:async()=>({id:'income'})},leaveEncashment:{create:async({data})=>{ledger.push(data);return data}},payslip:{groupBy:async()=>[],createMany:async({data})=>{slips=data}}};
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c',userId:'u',role:'COMPANY_ADMIN'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>write},'@/lib/prisma':{prisma:{$transaction:async f=>f(tx)}},'@/lib/audit':{logAudit:async()=>{}}})('src/app/api/leaves/encashments/bulk/route.ts');
 const body={id:'a2c091df-7fc4-4cf2-982a-4c6168776a56',year:2026,payDate:'2026-12-15',reason:'Year-end conversion',reviewed:true,entries:balances.map(b=>({balanceId:b.id,days:2,dailyRate:1000,isTaxable:true,withholdingTax:100}))};
 return {body,balances,post:b=>api.POST({json:async()=>b??body}),get run(){return run},get slips(){return slips},get ledger(){return ledger}};
}
test('creates one computed encashment payroll for multiple employees with reviewed tax only',async()=>{const f=fixture();assert.equal((await f.post()).status,201);assert.equal(f.run.runType,'LEAVE_ENCASHMENT');assert.equal(f.run.totalGross,4000);assert.equal(f.run.totalNetPay,3800);assert.equal(f.slips.length,2);assert.equal(f.ledger.length,2);for(const s of f.slips){assert.equal(s.basicSalary,0);assert.equal(s.netPay,1900);assert.equal(s.otherEarnings,2000);assert.equal(s.sssEe,undefined);assert.equal(s.companyLoan,undefined);assert.equal(s.manualEdits.customIncomes[0].amount,2000)}assert.deepEqual(f.balances.map(b=>b.encashed),[2,2]);assert.equal((await f.post()).status,200);assert.deepEqual(f.balances.map(b=>b.encashed),[2,2]);assert.equal(f.ledger.length,2)});
test('multiple balances for one employee produce a single itemized payslip',async()=>{const f=fixture({sameEmployee:true});assert.equal((await f.post()).status,201);assert.equal(f.slips.length,1);assert.equal(f.slips[0].grossPay,4000);assert.equal(f.slips[0].manualEdits.customIncomes.length,2)});
test('insufficient balance or inaccessible balance aborts the entire batch before any writes',async()=>{for(const options of [{short:true},{foreign:true}]){const f=fixture(options);assert.equal((await f.post()).status,409);assert.equal(f.run,null);assert.equal(f.ledger.length,0);assert.deepEqual(f.balances.map(b=>b.encashed),[0,0])}});
test('write permission and explicit review are required',async()=>{const f=fixture({write:false});assert.equal((await f.post()).status,403);const g=fixture();assert.equal((await g.post({...g.body,reviewed:false})).status,422);assert.equal(g.run,null)});
test('rejects duplicate balance IDs, invalid payment dates, and excessive/exempt tax',async()=>{const f=fixture();for(const body of [{...f.body,entries:[f.body.entries[0],f.body.entries[0]]},{...f.body,payDate:'2026-02-30'}])assert.equal((await f.post(body)).status,422);for(const patch of [{withholdingTax:2001},{isTaxable:false,withholdingTax:1}])assert.equal((await f.post({...f.body,entries:[{...f.body.entries[0],...patch},f.body.entries[1]]})).status,409);assert.equal(f.run,null)});
test('same id with changed reviewed inputs cannot be reused',async()=>{const f=fixture();await f.post();assert.equal((await f.post({...f.body,reason:'Changed request'})).status,409);assert.equal(f.ledger.length,2)});
test('batch cancellation restores every balance and removes generated unpaid slips',async()=>{
 let restored=0,removed=false,runUpdate;
 const tx={$queryRaw:async()=>[],leaveEncashment:{findFirst:async()=>({id:'id',payrollRunId:'r'}),findMany:async()=>[{balanceId:'b1',days:2},{balanceId:'b2',days:3}],updateMany:async()=>({count:2})},payrollRun:{findUniqueOrThrow:async()=>({id:'r',status:'COMPUTED',runType:'LEAVE_ENCASHMENT'}),update:async({data})=>{runUpdate=data}},leaveBalance:{update:async({data})=>{restored+=data.encashed.decrement}},payslip:{deleteMany:async()=>{removed=true}}};
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c',role:'COMPANY_ADMIN'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>true},'@/lib/prisma':{prisma:{$transaction:async f=>f(tx)}},'@/lib/audit':{logAudit:async()=>{}}})('src/app/api/leaves/encashments/route.ts');assert.equal((await api.PATCH({json:async()=>({id:'a2c091df-7fc4-4cf2-982a-4c6168776a56'})})).status,200);assert.equal(restored,5);assert.ok(removed);assert.equal(runUpdate.status,'DRAFT');assert.equal(runUpdate.totalNetPay,0)
});
test('integrity check rejects missing ledger and mismatched payouts',async()=>{const {encashmentPayrollIssue}=loader()('src/lib/payroll/encashment-run.ts');let amount=2000;const db={leaveEncashment:{findMany:async()=>[{id:'l',amount:2000,balance:{employeeId:'e'}}]},payslip:{findMany:async()=>[{employeeId:'e',grossPay:amount,netPay:1900,totalDeductions:100,withholdingTax:100,calculationBasis:{rows:[{id:'l',amount:2000,withholdingTax:100}]}}]}};assert.equal(await encashmentPayrollIssue(db,'r','c'),null);amount=3000;assert.ok(await encashmentPayrollIssue(db,'r','c'))});
test('approved, submitted, locked and disbursed batches cannot restore credits through cancellation',async()=>{
 for(const status of ['FOR_APPROVAL','APPROVED','LOCKED','DISBURSED']){
  let writes=0;const tx={$queryRaw:async()=>[],leaveEncashment:{findFirst:async()=>({payrollRunId:'r'}),updateMany:async()=>{writes++;return {count:1}}},payrollRun:{findUniqueOrThrow:async()=>({id:'r',status,runType:'LEAVE_ENCASHMENT'})}};
  const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c',role:'COMPANY_ADMIN'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>true},'@/lib/prisma':{prisma:{$transaction:async f=>f(tx)}},'@/lib/audit':{logAudit:async()=>{}}})('src/app/api/leaves/encashments/route.ts');assert.equal((await api.PATCH({json:async()=>({id:'a2c091df-7fc4-4cf2-982a-4c6168776a56'})})).status,409);assert.equal(writes,0)
 }
});
