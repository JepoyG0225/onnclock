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








test('user list counts unique current permissions and honors custom assignments',async()=>{
 const calls=[]
 const route=loader({
  '@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c1',role:'COMPANY_ADMIN',userId:'admin'}})},
  '@/lib/custom-roles':{ensureCustomRoleTables:async()=>{}},
  '@/lib/prisma':{prisma:{userCompany:{findMany:async args=>{assert.equal(args.where.companyId,'c1');return [{id:'1',userId:'u1',role:'HR_MANAGER'},{id:'2',userId:'u2',role:'HR_MANAGER'},{id:'3',userId:'u3',role:'HR_MANAGER'},{id:'4',userId:'u4',role:'COMPANY_ADMIN'}]}},$queryRaw:async()=>[{userId:'u3',customRoleId:'custom1',customRoleName:'No access'}]}},
  '@/lib/auth/effective-permissions':{getEffectivePermissions:async(role,company,user)=>{calls.push({role,company,user});assert.equal(company,'c1');if(user==='u3')return [];if(role==='COMPANY_ADMIN')return ['users:manage','settings:write','settings:read'];return ['employees:read','employees:read','retired:permission']}},
 })('src/app/api/users/route.ts')
 const response=await route.GET();const data=await response.json()
 assert.deepEqual(data.members.map(m=>m.permissionCount),[1,1,0,3]);assert.equal(data.members[2].customRoleName,'No access');assert.equal(calls.length,3);assert.equal(response.headers.get('Cache-Control'),'private, no-store')
})
