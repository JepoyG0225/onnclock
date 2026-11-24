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


const policy=loader()('src/lib/expenses/policy.ts')
function setup(role='COMPANY_ADMIN',current=null){const writes=[];const tx={$queryRaw:async()=>{},company:{findUniqueOrThrow:async()=>({expenseClaimTypes:current}),update:async args=>writes.push(args)}};const api=loader({'@/lib/expenses/access':{expenseAccess:async()=>({ctx:{companyId:'company',role}})},'@/lib/prisma':{prisma:{$transaction:async fn=>fn(tx)}},'@/lib/audit':{logAudit:async()=>{}}})('src/app/api/expenses/types/route.ts');return{writes,put:body=>api.PUT({json:async()=>body})}}
test('companies start with defaults and accept custom expense types',()=>{
 assert.deepEqual(policy.companyExpenseTypes(null),[...policy.expenseCategories]);assert.deepEqual(policy.companyExpenseTypes(['Travel']),['Travel'])
 assert.equal(policy.claimFields.safeParse({category:'Client entertainment',description:'Client meeting',expenseDate:'2026-10-27',amount:100}).success,true)
})
test('admins add and rename types scoped to their company',async()=>{
 const {writes,put}=setup();const response=await put({previous:[...policy.expenseCategories],types:['Travel','Client entertainment']});assert.equal(response.status,200);assert.equal(writes[0].where.id,'company');assert.deepEqual(writes[0].data.expenseClaimTypes,['Travel','Client entertainment'])
})
test('employees cannot manage types',async()=>{const {writes,put}=setup('EMPLOYEE');assert.equal((await put({})).status,403);assert.equal(writes.length,0)})
test('duplicate or blank names and stale edits cannot overwrite settings',async()=>{
 const {writes,put}=setup();for(const types of [['Travel','travel'],[' '],[]])assert.equal((await put({previous:[...policy.expenseCategories],types})).status,422)
 assert.equal((await put({previous:['Stale'],types:['Travel']})).status,409);assert.equal(writes.length,0)
})
