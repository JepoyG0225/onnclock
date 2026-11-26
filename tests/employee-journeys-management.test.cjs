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





function routeFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?routeFiles(path.join(dir,e.name)):e.name==='route.ts'?[path.join(dir,e.name)]:[])}
const ctx={userId:'custom-user',companyId:'company-a',role:'CUSTOM_PEOPLE'}
const common={
 '@/lib/api-auth':{requireAuth:async(...args)=>{assert.equal(args.length,0,'must use module permissions, not role allowlists');return {ctx,error:null}}},
 '@/lib/hris-pro':{requireHrisProApi:async()=>null},
 '@/lib/recruitment-runtime':{recruitmentModelsReady:()=>true},
 '@/lib/feature-gates':{getCompanySubscription:async()=>({pricePerSeat:100,isTrial:false}),hasHrisProFeature:()=>true},
 '@/lib/supabase/admin':{},
}
for(const module of ['onboarding','offboarding'])for(const file of routeFiles(`src/app/api/${module}`)){
 test(`${file}: every handler rejects missing module permission before data access`,async()=>{
  const route=loader({...common,'@/lib/auth/effective-permissions':{ctxHasPermission:async(c,p)=>{assert.equal(p,`${module}:manage`);return false}},'@/lib/prisma':{prisma:new Proxy({},{get(){throw Error('Unauthorized database access')}})}})(file)
  for(const [method,handler] of Object.entries(route)){if(!['GET','POST','PATCH','DELETE'].includes(method))continue;const response=await handler(new Request('https://example.com/api/test'),{params:Promise.resolve({id:'x',processId:'x',stepId:'x',itemId:'x'})});assert.equal(response.status,403)}
 })
 test(`${file}: custom module role passes permission check`,async()=>{
  const sentinel=Error('Reached authorized handler')
  const route=loader({...common,'@/lib/auth/effective-permissions':{ctxHasPermission:async(c,p)=>{assert.equal(p,`${module}:manage`);throw sentinel}},'@/lib/prisma':{prisma:{}}})(file)
  for(const [method,handler] of Object.entries(route)){if(!['GET','POST','PATCH','DELETE'].includes(method))continue;await assert.rejects(()=>handler(new Request('https://example.com/api/test'),{params:Promise.resolve({})}),e=>e===sentinel)}
 })
}
for(const module of ['onboarding','offboarding'])test(`${module} picker is tenant scoped and excludes private payroll fields`,async()=>{
 let query
 const route=loader({...common,'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>true},'@/lib/prisma':{prisma:{employee:{findMany:async q=>{query=q;return []}}}}})(`src/app/api/${module}/employees/route.ts`)
 assert.equal((await route.GET()).status,200);assert.equal(query.where.companyId,'company-a');assert.equal(query.where.isActive,true);assert.equal(query.select.basicSalary,undefined);assert.equal(query.select.bankAccountNo,undefined)
})
test('journey access supports either module and a safe landing for narrow roles',()=>{
 const access=loader()('src/lib/auth/page-access.ts')
 for(const p of ['onboarding:manage','offboarding:manage']){assert.equal(access.canAccessPath('/employee-journeys',[p]),true);assert.equal(access.findFirstAccessiblePath([p]),'/employee-journeys')}
 assert.equal(access.canAccessPath('/employee-journeys',['recruitment:manage']),false)
})
test('legacy recruitment links preserve selected journey and extra query parameters',async()=>{
 const proxy=loader({'@/lib/auth':{auth:fn=>fn},'@/lib/auth/mutation-permissions':{},'@/lib/auth/effective-permissions':{},'@/lib/desktop-token':{}})('src/proxy.ts').default
 for(const tab of ['onboarding','offboarding']){const u=new URL(`https://onclockph.com/recruitment?tab=${tab}&employeeId=employee-a&processId=case-a`);u.clone=()=>new URL(u);const response=await proxy({headers:new Headers({host:'onclockph.com'}),nextUrl:u});const location=new URL(response.headers.get('location'));assert.equal(location.pathname,'/employee-journeys');assert.equal(location.searchParams.get('tab'),tab);assert.equal(location.searchParams.get('employeeId'),'employee-a');assert.equal(location.searchParams.get('processId'),'case-a')}
})
test('journey tabs only include the granted management module',()=>{
 let tabs
 const Component=loader({
 '@/components/layout/TabbedPage':{TabbedPage:props=>{tabs=props.tabs;return null}},
 './EmployeeJourneys':{EmployeeJourneys:()=>null},'./OnboardingManager':{OnboardingManager:()=>null},
 '@/components/recruitment/OffboardingTab':{OffboardingTab:()=>null},
 '@/components/recruitment/Recruitment.module.css':{},
 })('src/components/onboarding/EmployeeJourneysHub.tsx').EmployeeJourneysHub
 renderToStaticMarkup(React.createElement(Component,{canOnboard:true,canOffboard:false}));assert.deepEqual(tabs.map(t=>t.id),['overview','onboarding'])
 renderToStaticMarkup(React.createElement(Component,{canOnboard:false,canOffboard:true}));assert.deepEqual(tabs.map(t=>t.id),['overview','offboarding'])
})
