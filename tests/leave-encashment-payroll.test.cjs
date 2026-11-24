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

function fixture(status='COMPUTED',runType='REGULAR',write=true,busy=false) {
 const run={id:'r',status,runType,computationStartedAt:busy?new Date():null,employeeScopeMode:'ALL'};let writes=0,query;
 const tx={$queryRaw:async()=>[],payrollRun:{findFirst:async()=>run,update:async({data})=>{Object.assign(run,data)}},leaveEncashment:{findUnique:async()=>null,create:async({data})=>{writes++;return data}},leaveBalance:{findFirst:async()=>({id:'b',employeeId:'e',employee:{},entitled:10,used:0,pending:0,encashed:0}),update:async()=>{}},incomeType:{upsert:async()=>({id:'i'})}};
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c',userId:'u',role:'COMPANY_ADMIN'}})},'@/lib/auth/effective-permissions':{ctxHasPermission:async(_,p)=>p==='payroll:read'||write},'@/lib/leaves/balance':{availableLeave:()=>10},'@/lib/prisma':{prisma:{$transaction:async f=>f(tx),payrollRun:{findMany:async({where})=>{query=where;return []}},leaveBalance:{findMany:async()=>[]},leaveEncashment:{findMany:async()=>[]},payrollCycleConfig:{findUnique:async()=>null}}},'@/lib/audit':{logAudit:async()=>{}}})('src/app/api/leaves/encashments/route.ts');
 return {run,writes:()=>writes,query:()=>query,get:()=>api.GET({nextUrl:new URL('http://localhost/?year=2026')}),post:()=>api.POST({json:async()=>({id:'d56f5602-1016-4a77-a2fa-77cbb43b0201',balanceId:'b',payrollRunId:'r',days:1,dailyRate:1000,isTaxable:false,reason:'Annual conversion'})})};
}
test('selector lists only idle computed regular runs for the company',async()=>{const f=fixture();assert.equal((await f.get()).status,200);assert.deepEqual(f.query(),{companyId:'c',status:'COMPUTED',runType:'REGULAR',computationStartedAt:null})});
test('computed run accepts conversion and invalidates totals until recomputed',async()=>{const f=fixture();assert.equal((await f.post()).status,201);assert.equal(f.writes(),1);assert.equal(f.run.status,'DRAFT');assert.equal(f.run.approvalLevel,0)});
test('noneligible statuses, special runs, active computation and read-only access cannot create conversions',async()=>{for(const status of ['DRAFT','PENDING_APPROVAL','APPROVED','LOCKED','DISBURSED']){const f=fixture(status);assert.equal((await f.post()).status,409,status);assert.equal(f.writes(),0)}for(const f of [fixture('COMPUTED','THIRTEENTH_MONTH'),fixture('COMPUTED','REGULAR',true,true)]){assert.equal((await f.post()).status,409);assert.equal(f.writes(),0)}const f=fixture('COMPUTED','REGULAR',false);assert.equal((await f.post()).status,403);assert.equal(f.writes(),0)});
