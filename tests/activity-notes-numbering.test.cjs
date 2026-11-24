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


test('daily numbering matches history and reports across shifts, pages and Philippine midnight',async()=>{
 const calls=[]
 const {numberActivities}=loader({
  '@/lib/prisma':{prisma:{
   dTRRecord:{findMany:async()=>[{id:'shift1',employeeId:'emp'},{id:'shift2',employeeId:'emp'},{id:'shift3',employeeId:'other'}]},
   attendanceActivity:{findMany:async args=>{calls.push(args);return args.where.dtrRecord.employeeId==='other'?[{id:'other'}]:args.where.loggedAt.gte.toISOString()==='2026-10-26T16:00:00.000Z'?[{id:'first'},{id:'second'}]:[{id:'next'}]}}
  }},
  '@/lib/auth/effective-permissions':{}
 })('src/lib/attendance/activities.ts')
 const rows=[{id:'second',dtrRecordId:'shift2',loggedAt:new Date('2026-10-27T15:59:00Z')},{id:'next',dtrRecordId:'shift2',loggedAt:new Date('2026-10-27T16:00:00Z')},{id:'other',dtrRecordId:'shift3',loggedAt:new Date('2026-10-27T15:59:00Z')}]
 const result=await numberActivities(rows,{companyId:'company'})
 assert.deepEqual(result.map(a=>a.dailyNumber),[2,1,1])
 assert.deepEqual(calls[0].orderBy,[{loggedAt:'asc'},{id:'asc'}])
 assert.deepEqual(calls[0].where.dtrRecord.employee,{companyId:'company'})
})
