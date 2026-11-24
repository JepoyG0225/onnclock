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





function harness({allowed=true,target=true,cap=3000,pending=0}={}){
 let saved=null,audit=null
 const db={employee:{findFirst:async({where})=>{assert.equal(where.companyId,'c');return target?{id:where.id||'self'}:null},findUnique:async()=>({id:'e',firstName:'Ana',lastName:'Cruz',rateType:'MONTHLY',basicSalary:10000,isActive:true})},cashAdvanceRequest:{count:async()=>pending,create:async({data})=>{saved=data;return{id:'r',...data}}}}
 const load=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{userId:'u',companyId:'c',role:'HR_MANAGER'},error:null})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>allowed},'@/lib/prisma':{prisma:db},'@/lib/cash-advance-limit':{computeCashAdvanceLimit:async()=>({available:cap,rawCap:3000,outstanding:3000-cap})},'@/lib/notifications-audience':{requestNotificationRecipients:async()=>[]},'@/lib/notifications':{},'@/lib/audit':{logAudit:async(_ctx,_action,_type,_id,details)=>{audit=details}}})
 return{post:load('src/app/api/cash-advance/route.ts').POST,saved:()=>saved,audit:()=>audit}
}
const body={employeeId:'e',amountRequested:1500,reason:'Emergency assistance',repaymentMonths:6}
test('authorized manual entry creates a pending CA and records the admin origin',async()=>{const h=harness();assert.equal((await h.post({json:async()=>body})).status,201);assert.equal(h.saved().employeeId,'e');assert.equal(h.saved().companyId,'c');assert.equal(h.saved().status,'PENDING');assert.equal(h.saved().repaymentMonths,6);assert.match(h.audit().description,/Admin manual entry/)})
test('read-only staff cannot file for another employee',async()=>{const h=harness({allowed:false});assert.equal((await h.post({json:async()=>body})).status,403);assert.equal(h.saved(),null)})
test('manual entry rejects employees outside company scope',async()=>{const h=harness({target:false});assert.equal((await h.post({json:async()=>body})).status,404);assert.equal(h.saved(),null)})
test('manual entry retains the existing balance cap and pending-request rules',async()=>{for(const options of [{cap:1000},{pending:1}]){const h=harness(options);assert.equal((await h.post({json:async()=>body})).status,400);assert.equal(h.saved(),null)}})
test('cutoff terms are saved and invalid fractional currency is rejected',async()=>{const h=harness();assert.equal((await h.post({json:async()=>({...body,repaymentMonths:1,repaymentCutoffs:2})})).status,201);assert.equal(h.saved().repaymentCutoffs,2);assert.equal((await h.post({json:async()=>({...body,amountRequested:1.234})})).status,422)})
test('employee self-service without a target employee still works without admin permission',async()=>{const h=harness({allowed:false});const{employeeId,...own}=body;assert.equal((await h.post({json:async()=>own})).status,201);assert.equal(h.saved().employeeId,'self')})
