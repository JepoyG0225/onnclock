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


const access=loader()('src/lib/auth/page-access.ts')
const proxy=loader({'@/lib/auth':{auth:handler=>handler}})('src/proxy.ts').default
function request(path,role){const url=new URL('https://onclockph.com'+path);url.clone=()=>new URL(url);return {auth:{user:{id:'user',role}},nextUrl:url,headers:new Headers({host:'onclockph.com'}),cookies:{get:()=>undefined},method:'GET'}}
test('empty custom role reaches its profile without a middleware redirect loop',async()=>{
 const target=access.findFirstAccessiblePath([]);assert.equal(target,'/settings/profile');assert.equal(access.canAccessPath(target,[]),true)
 const result=await proxy(request(target,'HR_MANAGER'));assert.equal(result.headers.get('location'),null);assert.equal(result.headers.get('x-middleware-request-x-pathname'),target)
})
test('Workspace-only roles land on their assigned module',()=>{
 for(const [permission,target]of [['tasks:read','/tasks'],['learning:manage','/learning'],['assets:manage','/assets']])assert.equal(access.findFirstAccessiblePath([permission]),target)
})
test('settings middleware defers to permission enforcement without granting restricted settings',async()=>{
 for(const role of ['HR_MANAGER','PAYROLL_OFFICER'])assert.equal((await proxy(request('/settings/profile',role))).headers.get('location'),null)
 assert.equal(access.canAccessPath('/settings/users',[]),false);assert.equal(access.canAccessPath('/settings/permissions',['tasks:read']),false)
})

test('expired subscriptions show a stable notice for roles without billing access',()=>{
 const {SubscriptionGate}=loader({'next/navigation':{usePathname:()=>'/tasks',useRouter:()=>({replace:()=>{throw Error('Unexpected redirect')}})}})('src/components/layout/SubscriptionGate.tsx')
 const html=renderToStaticMarkup(React.createElement(SubscriptionGate,{status:'EXPIRED',trialEndsAt:null,canManageBilling:false},'Restricted content'))
 assert.match(html,/Company subscription inactive/);assert.match(html,/settings\/profile/);assert.ok(!html.includes('Restricted content'))
})
