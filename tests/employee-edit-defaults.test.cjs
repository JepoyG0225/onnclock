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







for (const savedValue of [true, false]) {
 test(`employee edit reload preserves saved ND exclusion ${savedValue}`, async () => {
  let received
  const employee = {id:'e',companyId:'c',employeeNo:'EMP-001',firstName:'Test',lastName:'Employee',basicSalary:1000,employmentStatus:'REGULAR',disableNightDifferential:savedValue}
  const page = loader({
   '@/lib/auth':{auth:async()=>({user:{id:'admin'}})},
   '@/lib/effective-company':{resolveEffectiveCompanyId:async()=> 'c'},
   '@/lib/prisma':{prisma:{
    employee:{findFirst:async(args)=>{assert.deepEqual(args.where,{id:'e',companyId:'c'});return employee}},
    department:{findMany:async()=>[]},position:{findMany:async()=>[]},workSchedule:{findMany:async()=>[]}
   }},
   '@/components/employees/EmployeeForm':{EmployeeForm:props=>{received=props;return null}},
   'next/navigation':{redirect:()=>{throw Error('unexpected redirect')},notFound:()=>{throw Error('unexpected missing employee')}}
  })('src/app/(dashboard)/employees/[id]/edit/page.tsx').default
  renderToStaticMarkup(await page({params:Promise.resolve({id:'e'})}))
  assert.equal(received.defaultValues.disableNightDifferential,savedValue)
  assert.equal(received.employeeId,'e')
 })
}
