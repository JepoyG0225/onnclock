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


const { Prisma } = require('@prisma/client')
const rated = { id: 'review', companyId: 'company', employeeId: 'employee', overallRating: new Prisma.Decimal('4.25') }
function routes() {
 return loader({
  '@/lib/api-auth': { requireAuth: async () => ({ ctx: {companyId:'company', userId:'user', role:'COMPANY_ADMIN'} }) },
  '@/lib/feature-gates': {getCompanySubscription: async()=>({pricePerSeat:100}), hasHrisProFeature:()=>true},
  '@/lib/prisma': {prisma:{
   employee:{findFirst:async()=>({id:'employee'})},
   performanceReview:{findMany:async()=>[rated,{...rated,id:'draft',overallRating:null}], count:async()=>2, groupBy:async()=>[], findFirst:async()=>rated}
  }}
 })
}
test('Prisma decimal rating previously serialized as text',()=>{
 assert.equal(typeof JSON.parse(JSON.stringify(rated)).overallRating,'string')
})
for(const route of ['route.ts','my/route.ts','[id]/route.ts']) {
 test(`${route} returns numeric ratings and preserves unrated reviews`,async()=>{
  const api=routes()('src/app/api/performance-reviews/'+route)
  const response=await api.GET(new Request('https://example.test/api/performance-reviews'),{params:Promise.resolve({id:'review'})})
  assert.equal(response.status,200)
  const body=await response.json()
  const review=body.review ?? body.reviews[0]
  assert.equal(review.overallRating,4.25)
  assert.equal(review.overallRating.toFixed(1),'4.3')
  if(body.reviews)assert.equal(body.reviews[1].overallRating,null)
 })
}
