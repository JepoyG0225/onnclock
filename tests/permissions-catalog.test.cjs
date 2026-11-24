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


const catalog=loader()('src/lib/auth/permissions.ts')
test('every registered permission can be configured in the role matrix',()=>{
 const pages=catalog.PAGE_PERMISSIONS.flatMap(g=>g.pages)
 const represented=new Set(pages.map(p=>p.permission))
 assert.deepEqual(catalog.ALL_PERMISSIONS.filter(p=>!represented.has(p)),[])
 assert.equal(new Set(pages.map(p=>p.key)).size,pages.length)
 for(const p of pages)assert.ok(catalog.ALL_PERMISSIONS.includes(p.permission))
})
test('Workspace matches its sidebar features and is never hidden by viewer permissions',()=>{
 const workspace=catalog.PAGE_PERMISSIONS.find(g=>g.group==='Workspace')
 assert.ok(workspace)
 for(const key of ['tasks','tasks_manage','learning','announcements','assets'])assert.ok(workspace.pages.some(p=>p.key===key))
 const source=fs.readFileSync('src/app/(dashboard)/settings/permissions/page.tsx','utf8');assert.ok(!source.includes('PAGE_PERMISSIONS.filter'))
})
test('an explicitly empty custom role grants no built-in fallback access',async()=>{
 let fallback=false
 const {getEffectivePermissions}=loader({'@/lib/prisma':{prisma:{$queryRawUnsafe:async()=>[{permissions:[]}],companyRolePermission:{findUnique:async()=>{fallback=true;return null}}}}})('src/lib/auth/effective-permissions.ts')
 assert.deepEqual(await getEffectivePermissions('HR_MANAGER','company','user'),[])
 assert.equal(fallback,false)
})
test('role updates reject unknown permissions and roles before writing',async()=>{
 let writes=0
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company'}})},'@/lib/prisma':{prisma:{companyRolePermission:{upsert:async()=>writes++}}},'@/lib/custom-roles':{ensureCustomRoleTables:async()=>{},listCompanyCustomRoles:async()=>[]}})('src/app/api/settings/role-permissions/route.ts')
 for(const body of [{role:'HR_MANAGER',permissions:['unknown:permission']},{role:'SUPER_ADMIN',permissions:[]},{role:'custom:other-company',permissions:['tasks:read']}])assert.ok((await api.PUT({json:async()=>body})).status>=400)
 assert.equal(writes,0)
})

test('every company sidebar module has explicit checklist coverage and a route guard',()=>{
 const source=fs.readFileSync('src/components/layout/AppSidebar.tsx','utf8')
 const hrefs=[...source.matchAll(/href:\s*["'](\/[^"']*)["']/g)].map(m=>m[1]).filter(p=>!p.startsWith('/admin'))
 const pages=catalog.PAGE_PERMISSIONS.flatMap(g=>g.pages)
 const access=loader()('src/lib/auth/page-access.ts')
 for(const href of new Set(hrefs)) {
  const rows=pages.filter(p=>p.paths?.includes(href))
  assert.ok(rows.length,`Missing checklist module: ${href}`)
  assert.ok(access.getRequiredPermissionsForPath(href).length,`Missing route guard: ${href}`)
  assert.ok(rows.some(r=>access.canAccessPath(href,[r.permission])),`Checklist permission does not open ${href}`)
 }
})
test('all module checklist paths grant the page access they advertise',()=>{
 const access=loader()('src/lib/auth/page-access.ts')
 for(const page of catalog.PAGE_PERMISSIONS.flatMap(g=>g.pages))for(const href of page.paths??[])assert.ok(access.canAccessPath(href,[page.permission]),`${page.key}: ${page.permission} cannot open ${href}`)
})
