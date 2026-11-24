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



const policy=loader()('src/lib/hr-requests/policy.ts')
function setup({manager=false,employeeId='employee',currentEmployee='employee',status='OPEN'}={}){
 const reads=[],writes=[];const current={id:'request',companyId:'company',employeeId:currentEmployee,status,updatedAt:new Date('2026-10-27T00:00:00Z'),employee:{userId:'requester'},subject:'COE',assigneeId:null}
 const tx={$queryRaw:async()=>{},hrRequest:{findFirst:async()=>current,update:async args=>{writes.push(args)}},hrRequestMessage:{create:async args=>writes.push(args)},notification:{createMany:async args=>writes.push(args)}}
 const api=loader({'@/lib/hr-requests/access':{hrRequestAccess:async()=>({ctx:{companyId:'company',userId:'user',email:'user@example.test'},employeeId,canManage:manager}),hrRequestAssignees:async()=>[{id:'hr',name:'HR'}],attachmentSelect:{id:true}},'@/lib/prisma':{prisma:{hrRequest:{findFirst:async args=>{reads.push(args);return current}},$transaction:async fn=>fn(tx)}}})('src/app/api/hr-requests/[id]/route.ts')
 return{reads,writes,get:()=>api.GET({}, {params:Promise.resolve({id:'request'})}),patch:body=>api.PATCH({json:async()=>body},{params:Promise.resolve({id:'request'})})}
}
test('employee reads are tenant scoped, owned and exclude internal notes',async()=>{const s=setup();assert.equal((await s.get()).status,200);assert.deepEqual(s.reads[0].where,{id:'request',companyId:'company',employeeId:'employee'});assert.deepEqual(s.reads[0].include.messages.where,{internal:false})})
test('HR reads are tenant scoped and can include internal notes',async()=>{const s=setup({manager:true});await s.get();assert.deepEqual(s.reads[0].where,{id:'request',companyId:'company'});assert.deepEqual(s.reads[0].include.messages.where,{})})
test('employees cannot edit another request or write internal notes',async()=>{for(const options of [{currentEmployee:'other'},{}]){const s=setup(options);assert.ok([403,404].includes((await s.patch({action:'MESSAGE',body:'Secret',internal:true})).status));assert.equal(s.writes.length,0)}})
test('stale edits cannot overwrite HR work',async()=>{const s=setup();assert.equal((await s.patch({action:'CANCEL',updatedAt:'2026-10-26T00:00:00.000Z'})).status,409);assert.equal(s.writes.length,0)})
test('employees can cancel their open request and reopen resolved requests',async()=>{const s=setup();assert.equal((await s.patch({action:'CANCEL',updatedAt:'2026-10-27T00:00:00.000Z'})).status,200);assert.equal(s.writes[0].data.status,'CANCELLED');assert.equal(policy.requestActionError('REOPEN','RESOLVED',true,false),null);assert.ok(policy.requestActionError('MESSAGE','CANCELLED',true,false));assert.ok(policy.requestActionError('REOPEN','OPEN',true,false))})
test('HR completion requires resolution and same-company authorized assignee',async()=>{const s=setup({manager:true});const body={action:'MANAGE',updatedAt:'2026-10-27T00:00:00.000Z',status:'RESOLVED',priority:'NORMAL',assigneeId:null,neededBy:null,resolution:null};assert.equal((await s.patch(body)).status,422);assert.equal((await s.patch({...body,resolution:'Done',assigneeId:'foreign-user'})).status,422);assert.equal(s.writes.length,0)})
test('internal notes never notify the employee',async()=>{const s=setup({manager:true});assert.equal((await s.patch({action:'MESSAGE',body:'Internal HR discussion',internal:true})).status,200);const notification=s.writes.at(-1);assert.deepEqual(notification.data.map(n=>n.userId),['hr'])})

test('file downloads enforce company and employee ownership before issuing signed links',async()=>{
 let query,signed=0
 const api=loader({'@/lib/hr-requests/access':{hrRequestAccess:async()=>({ctx:{companyId:'company'},employeeId:'employee',canManage:false})},'@/lib/prisma':{prisma:{hrRequestAttachment:{findFirst:async args=>{query=args;return null}}}},'@/lib/hr-requests/storage':{hrRequestStorage:async()=>{signed++;return{}}}})('src/app/api/hr-requests/[id]/files/[fileId]/route.ts')
 assert.equal((await api.GET({}, {params:Promise.resolve({id:'request',fileId:'file'})})).status,404)
 assert.deepEqual(query.where.request,{companyId:'company',employeeId:'employee'});assert.equal(signed,0)
})
