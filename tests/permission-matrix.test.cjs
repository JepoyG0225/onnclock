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


const load=loader()
const {PERMISSION_MATRIX_GROUPS: groups,permissionSelection,togglePermissionSelection}=load('src/lib/auth/permission-matrix.ts')
const {PAGE_PERMISSIONS}=load('src/lib/auth/permissions.ts')
const rows=groups.flatMap(g=>g.rows)
test('grouped matrix preserves every catalog permission in its original category',()=>{
 for(const group of PAGE_PERMISSIONS){
  const actual=groups.find(g=>g.group===group.group)
  assert.deepEqual([...new Set(actual.rows.flatMap(r=>[...r.read,...r.write]))].sort(),[...new Set(group.pages.map(p=>p.permission))].sort())
  assert.equal(new Set(actual.rows.map(r=>r.key)).size,actual.rows.length)
 }
})
test('DTR is one row with read and grouped edit/approval',()=>{
 const row=rows.find(r=>r.key==='dtr')
 assert.deepEqual(row.read,['dtr:read'])
 assert.deepEqual(row.write,['dtr:write','dtr:approve'])
 assert.ok(!rows.some(r=>r.key==='dtr_approve'||r.key==='dtr_write'))
})
test('partial existing grants are preserved and toggle all writes together without changing read',()=>{
 const row=rows.find(r=>r.key==='payroll')
 const original=new Set(['payroll:read','payroll:write','expenses:read'])
 assert.deepEqual(permissionSelection(original,row.write),{checked:false,partial:true})
 const enabled=togglePermissionSelection(original,row.write)
 assert.ok(enabled.has('payroll:approve')&&enabled.has('payroll:lock'))
 const disabled=togglePermissionSelection(enabled,row.write)
 assert.deepEqual([...disabled].sort(),['expenses:read','payroll:read'])
 assert.deepEqual([...original],['payroll:read','payroll:write','expenses:read'])
})
test('read selection does not grant approvals or writes',()=>{
 const row=rows.find(r=>r.key==='leaves')
 assert.deepEqual([...togglePermissionSelection(new Set(),row.read)],['leaves:read'])
 assert.deepEqual(row.write,['leaves:write','leaves:approve'])
})
test('manage-only modules do not pretend to offer read-only access',()=>{
 const row=rows.find(r=>r.key==='learning')
 assert.deepEqual(row.read,[])
 assert.deepEqual(row.write,['learning:manage'])
})
