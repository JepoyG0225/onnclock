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







const holidays=loader({'@/lib/prisma':{prisma:{}},'@/lib/notifications':{}})('src/lib/holidays/google-calendar.ts')
test('both sources exclude incorrect October 31 2026, preserving other dates and years',async()=>{
 const original=global.fetch
 try {
  global.fetch=async()=>({ok:true,json:async()=>[{date:'2026-10-31',name:"All Saints' Day Eve"},{date:'2026-12-25',name:'Christmas Day'}]})
  assert.deepEqual((await holidays.fetchPublicPhHolidaysForYear({year:2026})).map(r=>r.date),['2026-12-25'])
  global.fetch=async()=>({ok:true,json:async()=>({items:[{start:{date:'2026-10-31'},summary:"All Saints' Day Eve"},{start:{date:'2026-12-25'},summary:'Christmas Day'}]})})
  assert.deepEqual((await holidays.fetchGoogleHolidaysForYear({year:2026,apiKey:'test'})).map(r=>r.date),['2026-12-25'])
  global.fetch=async()=>({ok:true,json:async()=>[{date:'2025-10-31',name:'Special non-working day'}]})
  assert.equal((await holidays.fetchPublicPhHolidaysForYear({year:2025})).length,1)
 } finally {global.fetch=original}
})
test('cron runs at midnight Manila and rejects unauthorized requests',async()=>{
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'))
 assert.equal(config.crons.find(c=>c.path==='/api/holidays/sync-google/cron').schedule,'0 16 * * *')
 const route=loader({'@/lib/prisma':{prisma:{}},'@/lib/holidays/google-calendar':{GoogleHolidaySync:{}}})('src/app/api/holidays/sync-google/cron/route.ts')
 const response=await route.GET({headers:new Headers()})
 assert.equal(response.status,401)
})
