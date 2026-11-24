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


function setup() {
 const stored={id:'employee',firstName:'Ana',lastName:'Test',middleName:'Middle',suffix:'Jr.',personalEmail:'ana@example.test',mobileNo:'09170000000',sssNo:'sss-original',philhealthNo:'ph-original',pagibigNo:'pi-original',tinNo:'tin-original',faceEmbedding:[1,2,3]}
 const updates=[]
 const api=loader({
  '@/lib/face/availability':{},
  '@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company',userId:'user'}})},
  '@/lib/portal-employee':{resolvePortalEmployeeId:async()=>stored.id},
  '@/lib/prisma':{prisma:{
    employee:{findUnique:async()=>({...stored})},
    $transaction:async fn=>fn({
      $queryRaw:async()=>{},
      company:{findUniqueOrThrow:async()=>({hrOperationsSettings:null})},
      employee:{findFirstOrThrow:async()=>({...stored}),findUniqueOrThrow:async()=>({...stored}),update:async args=>{updates.push(args);for(const [key,value] of Object.entries(args.data))if(value!==undefined)stored[key]=value;return {...stored}}},
      hrOperation:{create:async()=>({id:'history'})},hrOperationEvent:{create:async()=>({})}
    })
  }}

 })('src/app/api/employees/me/route.ts')
 return {stored,updates,patch:body=>api.PATCH({json:async()=>body})}
}
test('saving contact information preserves government IDs and personal name fields',async()=>{
 const {stored,patch}=setup();const response=await patch({personalEmail:'new@example.test',mobileNo:'09990000000'})
 assert.equal(response.status,200);assert.equal(stored.personalEmail,'new@example.test')
 for(const [key,value]of Object.entries({sssNo:'sss-original',philhealthNo:'ph-original',pagibigNo:'pi-original',tinNo:'tin-original',middleName:'Middle',suffix:'Jr.'}))assert.equal(stored[key],value)
 assert.equal((await response.json()).employee.faceEmbedding,undefined)
})
test('saving IDs preserves contact information; subsequent personal edits preserve both',async()=>{
 const {stored,patch}=setup();await patch({sssNo:'sss-new',philhealthNo:'ph-new',pagibigNo:'pi-new',tinNo:'tin-new'});await patch({firstName:'Ann'})
 assert.equal(stored.firstName,'Ann');assert.equal(stored.personalEmail,'ana@example.test');assert.equal(stored.mobileNo,'09170000000');assert.equal(stored.sssNo,'sss-new');assert.equal(stored.tinNo,'tin-new')
})
test('explicit clearing is allowed without clearing omitted fields or accepting protected fields',async()=>{
 const {stored,patch}=setup();await patch({mobileNo:null,sssNo:null,companyId:'other',basicSalary:999999})
 assert.equal(stored.mobileNo,null);assert.equal(stored.sssNo,null);assert.equal(stored.personalEmail,'ana@example.test');assert.equal(stored.tinNo,'tin-original');assert.equal(stored.companyId,undefined);assert.equal(stored.basicSalary,undefined)
})
test('invalid payloads cannot update the profile',async()=>{
 const {patch,updates}=setup();for(const body of [null,[],42])assert.equal((await patch(body)).status,422);assert.equal(updates.length,0)
})
