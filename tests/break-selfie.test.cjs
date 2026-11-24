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





const {NextRequest}=require('next/server');
test('break selfies enforce policy, exemption, validation and save each action independently',async()=>{
 for(const action of ['BREAK_START','BREAK_END'])for(const mode of ['required','valid','invalid','exempt','disabled']){
 let saved;
 const service=loader({
 '@/lib/prisma':{prisma:{employee:{findFirst:async()=>({selfieExempt:mode==='exempt',company:{selfieRequired:mode!=='disabled'},workSchedule:null})},dTRRecord:{findFirst:async()=>({id:'dtr',timeIn:new Date(),timeOut:null,breakIn:action==='BREAK_END'?new Date():null,breakOut:null}),updateMany:async({data})=>{saved=data;return {count:1}}}}},
 '@/lib/attendance/punch-target':{resolvePunchEmployeeId:async()=>({employeeId:'emp'})},
 '@/lib/attendance/kiosk-action':{resolveKioskShift:async()=>({breakMinutes:60})},
 '@/lib/attendance/activities':{normalizeActivityPhoto:async p=>{if(p==='bad')throw Error('bad');return 'normalized'}},
 '@/lib/attendance/schedule-location':{},'@/lib/attendance/location-policy':{}
 })('src/lib/attendance/break.ts');
 const r=await service.performBreak(new NextRequest('https://example.com',{method:'POST',body:JSON.stringify({photo:mode==='valid'?'image':mode==='invalid'?'bad':undefined})}),{companyId:'co'},action);
 assert.equal(r.status,['required','invalid'].includes(mode)?400:200);
 if(mode==='valid'){assert.equal(saved[action==='BREAK_START'?'breakInPhoto':'breakOutPhoto'],'normalized');assert.equal((await r.json()).record.breakInPhoto,undefined)}
 if(['required','invalid'].includes(mode))assert.equal(saved,undefined);
 }
});
