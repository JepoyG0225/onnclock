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

const Link=({href,children,...props})=>React.createElement('a',{href,...props},children);
function hub(permissions){return loader({'next/link':{__esModule:true,default:Link},'next/navigation':{redirect:url=>{throw Error(url)}},'@/lib/auth':{auth:async()=>({user:{id:'u',role:'CUSTOM',companyId:'c'}})},'@/lib/effective-company':{resolveEffectiveCompanyId:async()=> 'c'},'@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>permissions},'@/lib/hris-pro-access':{getHrisProEnabled:async()=>true},'@/components/layout/HrisProGate':{HrisProGate:({children})=>children},'@/components/budget/BudgetRequisitionsTab':{__esModule:true,default:()=>React.createElement('div',null,'Budget content')},'@/components/expenses/ExpensesClient':{ExpensesClient:()=>React.createElement('div',null,'Expense content')}})('src/app/(dashboard)/requisitions/page.tsx').default}
test('expense-only access does not render budget tab or data',async()=>{const html=renderToStaticMarkup(await hub(['expenses:read'])({searchParams:Promise.resolve({tab:'budget'})}));assert.match(html,/Expense content/);assert.doesNotMatch(html,/Budget content|Budget Requisitions/)});
test('budget-only access does not render expense tab or data',async()=>{const html=renderToStaticMarkup(await hub(['budget:read'])({searchParams:Promise.resolve({tab:'expenses'})}));assert.match(html,/Budget content/);assert.doesNotMatch(html,/Expense content|href="\/requisitions\?tab=expenses"/)});
test('combined permissions expose both tabs and select requested content',async()=>{const html=renderToStaticMarkup(await hub(['budget:read','expenses:read'])({searchParams:Promise.resolve({tab:'expenses'})}));assert.match(html,/tab=budget/);assert.match(html,/tab=expenses/);assert.match(html,/Expense content/);assert.doesNotMatch(html,/Budget content/)});
test('unprivileged user gets no tab data',async()=>{const html=renderToStaticMarkup(await hub([])({searchParams:Promise.resolve({})}));assert.match(html,/do not have access/);assert.doesNotMatch(html,/Budget content|Expense content/)});
test('legacy links retain their query and land on the correct tab',async()=>{for(const [route,tab]of [['budget-requisitions','budget'],['expenses','expenses']]){const page=loader({'next/navigation':{redirect:url=>{throw Error(url)}}})(`src/app/(dashboard)/${route}/page.tsx`).default;await assert.rejects(()=>page({searchParams:Promise.resolve({status:'PENDING',q:'Ana'})}),new RegExp('requisitions\\?status=PENDING&q=Ana&tab='+tab))}});
test('merged route allows each original reader without granting writes',()=>{const load=loader(),catalog=load('src/lib/auth/permissions.ts'),access=load('src/lib/auth/page-access.ts');for(const permission of ['budget:read','expenses:read','budget:approve','expenses:approve']){assert.ok(catalog.canAccessRoute('/requisitions',[permission]));assert.ok(access.canAccessPath('/requisitions',[permission]))}assert.equal(catalog.canAccessRoute('/requisitions',[]),false)});
