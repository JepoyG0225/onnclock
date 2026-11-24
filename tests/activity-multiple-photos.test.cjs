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






const {NextRequest}=require('next/server')
test('multiple camera photos persist together and retry without creating duplicate activity',async()=>{
 let record=null,writes=0
 const tx={$queryRaw:async()=>[{id:'shift',timeIn:new Date(),timeOut:null}],attendanceActivity:{findUnique:async()=>record,create:async({data})=>{writes++;record=data;return {id:data.id,photoCount:data.photoCount}}}}
 const db={employee:{findFirst:async()=>({id:'e'})},$transaction:async fn=>fn(tx)}
 const api=loader({'@/lib/prisma':{prisma:db},'@/lib/api-auth':{requireAuth:async()=>({ctx:{userId:'u',companyId:'c'}})},'@/lib/attendance/activities':{normalizeActivityPhoto:async p=>p,activitySelect:{}}})('src/app/api/attendance/activities/route.ts')
 const payload={id:'00000000-0000-4000-8000-000000000001',dtrRecordId:'shift',description:'Inspection',photos:['photo1','photo2'],photoSource:'camera'}
 const send=value=>api.POST(new NextRequest('https://app.test/api/attendance/activities',{method:'POST',body:JSON.stringify(value)}))
 assert.equal((await send(payload)).status,201);assert.equal(record.photoCount,2);assert.deepEqual(record.photos,['photo1','photo2']);assert.equal((await send(payload)).status,201);assert.equal(writes,1)
 assert.equal((await send({...payload,photos:['photo1','changed']})).status,400)
 assert.equal((await send({...payload,photos:Array(6).fill('photo')})).status,400)
})
test('photo endpoint enforces scope and selects the requested photo without exposing others',async()=>{
 const db={attendanceActivity:{findFirst:async q=>{assert.equal(q.where.dtrRecord.employee.companyId,'c');return {photo:'first',photos:['first','second']}}}}
 const api=loader({'@/lib/prisma':{prisma:db},'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'c'}})},'@/lib/attendance/activities':{activityScope:async()=>({companyId:'c'}),decodeActivityPhoto:p=>({bytes:Buffer.from(p),mime:'image/jpeg'})}})('src/app/api/attendance/activities/[id]/photo/route.ts')
 const response=await api.GET(new NextRequest('https://app.test/photo?index=1'),{params:Promise.resolve({id:'log'})});assert.equal(await response.text(),'second')
 assert.equal((await api.GET(new NextRequest('https://app.test/photo?index=9'),{params:Promise.resolve({id:'log'})})).status,404)
})
test('offline service worker caches only the public shell and does not intercept API requests',async()=>{
 const vm=require('node:vm'),handlers={},added=[]
 vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{URL,self:{location:{origin:'https://app.test'},skipWaiting:()=>{},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>({addAll:async urls=>added.push(...urls)}),match:async path=>path},fetch:async()=>{throw Error('Offline')}})
 let install;handlers.install({waitUntil:p=>install=p});await install;assert.deepEqual(added,['/portal-offline.html','/portal-offline.js'])
 let response;handlers.fetch({request:{url:'https://app.test/portal/clock',method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.equal(await response,'/portal-offline.html')
 let intercepted=false;handlers.fetch({request:{url:'https://app.test/api/attendance/today',method:'GET'},respondWith:()=>intercepted=true});assert.equal(intercepted,false)
})
