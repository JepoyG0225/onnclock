const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { NextRequest } = require('next/server')
function loader(overrides={}) {
 const cache=new Map(); function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>Object.hasOwn(overrides,name)?overrides[name]:name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):require(name),module,module.exports);return module.exports}return load
}

for(const [label,pricePerSeat,isTrial,allowed] of [['Pro',100,false,true],['Trial',0,true,true],['Base',50,false,false],['Security',70,false,false]]) {
 for(const module of ['benefits','expenses'])test(`${module}: ${label} entitlement`,async()=>{
  const ctx={companyId:'company',userId:'user',role:'EMPLOYEE'}
  const load=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx,error:null})},'@/lib/feature-gates':{PLAN_PRICE:{HRIS_PRO:100},getCompanySubscription:async()=>({pricePerSeat,isTrial}),hasHrisProFeature:price=>price>=100},'@/lib/prisma':{prisma:{employee:{findFirst:async()=>({id:'employee'})}}},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>false}})
  const result=module==='benefits'?await load('src/lib/benefits/access.ts').requireBenefitsAuth():await load('src/lib/expenses/access.ts').expenseAccess()
  assert.equal(result.error?.status??200,allowed?200:403)
 })
}
test('Benefits employee cannot create plans even on Pro',async()=>{
 const {POST}=loader({'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>false},'@/lib/benefits/access':{requireBenefitsAuth:async()=>({ctx:{companyId:'c',role:'EMPLOYEE'},error:null})},'@/lib/prisma':{prisma:{}},'@/lib/audit':{}})('src/app/api/benefits/route.ts')
 assert.equal((await POST(new NextRequest('http://localhost/api/benefits',{method:'POST',body:'{}'}))).status,403)
})
