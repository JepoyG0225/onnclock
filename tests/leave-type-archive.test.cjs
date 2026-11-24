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
test('archiving a leave type persists inactive flag and list excludes archived types',async()=>{
 let inactive=false;
 const route=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'co',role:'COMPANY_ADMIN'}})},'@/lib/prisma':{prisma:{leaveType:{updateMany:async({where,data})=>{assert.deepEqual(where,{id:'type',companyId:'co'});assert.equal(data.isActive,false);inactive=true;return {count:1}},findMany:async({where})=>{assert.equal(where.isActive,true);return inactive?[]:[{id:'type'}]}}}}})('src/app/api/leaves/types/route.ts');
 const result=await route.PATCH(new NextRequest('https://example.com',{method:'PATCH',body:JSON.stringify({id:'type',isActive:false})}));assert.equal(result.status,200);
 const list=await route.GET(new NextRequest('https://example.com'));assert.deepEqual((await list.json()).types,[]);
});
