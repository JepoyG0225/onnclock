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








const all = loader()('src/lib/auth/permissions.ts').ALL_PERMISSIONS
function fixture(permissions=all, pro=true) {
 const reads=[], writes=[]
 const prisma={company:{findUnique:async args=>{assert.equal(args.where.id,'company-a');return {address:'Office',email:'hr@example.test',setupJourney:{roles:true}}}},$executeRaw:async(...args)=>{writes.push(args);return 1}}
 for(const model of ['department','position','employee','workSchedule','leaveBalance','payrollRun','task','announcement']) prisma[model]={findFirst:async args=>{reads.push(args);assert.equal(args.where.companyId ?? args.where.employee.companyId,'company-a');return model==='department'?{id:'existing'}:null}}
 const route=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company-a',userId:'admin',role:'COMPANY_ADMIN'}})},'@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>permissions},'@/lib/hris-pro':{getHrisProAccess:async()=>({entitled:pro})},'@/lib/prisma':{prisma}})('src/app/api/setup-journey/route.ts')
 return {route,reads,writes}
}
test('progress is tenant scoped and auto completion comes from saved records',async()=>{const f=fixture();const r=await f.route.GET();assert.equal(r.status,200);const d=await r.json();assert.equal(d.steps.find(s=>s.id==='department').done,true);assert.equal(d.steps.find(s=>s.id==='employee').done,false);assert.equal(d.steps.find(s=>s.id==='roles').done,true);assert.ok(f.reads.length>0)})
test('plan and permission filtering excludes inaccessible modules',async()=>{const f=fixture(['settings:read'],false);const d=await(await f.route.GET()).json();assert.ok(d.steps.length);assert.equal(d.canEdit,false);assert.ok(d.steps.every(s=>!s.pro&&s.permission==='settings:read'));assert.equal(f.reads.some(r=>r.where.employee),false)})
test('read-only setup cannot mark any step reviewed',async()=>{const f=fixture(['settings:read']);const r=await f.route.PATCH({json:async()=>({id:'attendance',done:true})});assert.equal(r.status,403);assert.equal(f.writes.length,0)})
test('automatic steps cannot be forged; review updates are atomic and tenant bound',async()=>{const f=fixture();assert.equal((await f.route.PATCH({json:async()=>({id:'department',done:true})})).status,422);assert.equal((await f.route.PATCH({json:async()=>({id:'roles',done:true})})).status,200);assert.equal(f.writes.length,1);assert.equal(f.writes[0].at(-1),'company-a');assert.equal(f.writes[0][1],'{"roles":true}')})
test('unknown and plan-locked steps are rejected',async()=>{const f=fixture(all,false);for(const id of ['unknown','learning'])assert.equal((await f.route.PATCH({json:async()=>({id,done:true})})).status,422);assert.equal(f.writes.length,0)})
