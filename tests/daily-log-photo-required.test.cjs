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
test('daily logs reject missing or empty photos before any database write',async()=>{
 const route=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'co',userId:'user'}})},'@/lib/prisma':{prisma:{}},'@/lib/attendance/activities':{}})('src/app/api/attendance/activities/route.ts');
 for(const photo of [undefined,'']){
 const result=await route.POST(new NextRequest('https://example.com/api/attendance/activities',{method:'POST',body:JSON.stringify({id:'00000000-0000-4000-8000-000000000001',dtrRecordId:'shift',description:'Site visit',photo})}));
 assert.equal(result.status,400);assert.match((await result.json()).error,/Take a photo/);
 }
});
