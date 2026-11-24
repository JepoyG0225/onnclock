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
test('gallery includes saved selfies with action labels and enforces employee scope',async()=>{
 for(const found of [true,false]){
 let screenshotReads=0;
 const scope={companyId:'co',userId:'user'};
 const api=loader({
 '@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'co',userId:'user'}}),resolveCompanyIdForRequest:()=> 'co'},
 '@/lib/attendance/activities':{activityScope:async()=>scope},
 '@/lib/prisma':{prisma:{dTRRecord:{findFirst:async({where})=>{assert.deepEqual(where.employee,scope);return found?{id:'dtr',clockInPhoto:'in',breakInPhoto:'start',breakOutPhoto:'end',clockOutPhoto:'out',timeIn:new Date(),breakIn:new Date(),breakOut:new Date(),timeOut:new Date()}:null}},attendanceScreenshot:{findMany:async()=>{screenshotReads++;return [{id:'screen',imageDataUrl:'screen',capturedAt:new Date()}]}}}
 }})('src/app/api/dtr/[id]/captures/route.ts');
 const response=await api.GET(new NextRequest('https://example.com/api/dtr/dtr/captures'),{params:Promise.resolve({id:'dtr'})});
 assert.equal(response.status,found?200:404);
 if(found){const data=await response.json();assert.deepEqual(data.captures.map(r=>r.label),['Clock-in selfie','Break start selfie','Break end selfie','Clock-out selfie','Screenshot']);assert.equal(response.headers.get('cache-control'),'private, no-store')}
 else assert.equal(screenshotReads,0);
 }
});
