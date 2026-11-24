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


for (const scenario of ['active','completed','selected']) {
 test(`shift total covers all pages for ${scenario} shift`,async()=>{
  const counts=[]
  const api=loader({
   '@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company',userId:'user'}})},
   '@/lib/attendance/activities':{activityScope:async()=>({companyId:'company',userId:'user'}),monthRange:()=>({}),listActivities:async()=>[],numberActivities:async()=>[]},
   '@/lib/prisma':{prisma:{employee:{findFirst:async()=>({id:'employee'})},dTRRecord:{findFirst:async args=>args.where.timeOut===null&&scenario==='completed'?null:{id:'shift',date:new Date()}},attendanceActivity:{count:async args=>{counts.push(args.where);return args.where.dtrRecord.id?73:150},findMany:async()=>[]}}}
  })('src/app/api/attendance/activities/route.ts')
  const url=new URL('https://example.test/api/attendance/activities?page=2'+(scenario==='selected'?'&dtrRecordId=shift':''))
  const response=await api.GET({url:url.href,nextUrl:url})
  const data=await response.json()
  assert.equal(response.status,200)
  assert.equal(data.shiftTotal,73)
  assert.equal(data.shiftLabel,scenario==='selected'?'This shift':scenario==='active'?'Current shift':'Latest shift')
  assert.deepEqual(counts.at(-1).dtrRecord.employee,{companyId:'company',userId:'user'})
 })
}
