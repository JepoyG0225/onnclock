const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
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





function fixture(permission=true) {
 const calls={}; const db={employee:{findMany:async()=>[{id:'employee-a'}]},dTRRecord:{findMany:async args=>{calls.selection=args;return[{employeeId:'employee-a',date:new Date('2026-11-23')}]},updateMany:async args=>{calls.update=args;return{count:1}}},overtimeRequest:{findMany:async args=>{calls.otScope=args;return[{id:'ot-a'}]}}};
 const route=loader({'@/lib/prisma':{prisma:db},'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'company-a',userId:'admin'}}),resolveCompanyIdForRequest:()=> 'company-a'},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>permission},'@/lib/overtime-requests':{isOvertimeEnabledForCompany:async()=>true,approveAutoOtByIds:async args=>{calls.ot=args;return 1},approveAutoOtForRange:async()=>{throw Error('Unexpected broad OT approval')}}})('src/app/api/dtr/approve-all/route.ts');
 return {calls,send:body=>route.POST({json:async()=>({weekStart:'2026-11-23',weekEnd:'2026-11-29',...body})})}
}
test('selected approval retains company, completed-shift and tracking restrictions',async()=>{
 const f=fixture(); assert.equal((await f.send({recordIds:['record-a'],overtimeRequestIds:['ot-a','ot-other']})).status,200);
 const w=f.calls.update.where; assert.deepEqual(w.id.in,['record-a']);assert.deepEqual(w.employeeId.in,['employee-a']);assert.deepEqual(w.timeOut,{not:null});assert.equal(w.employee.trackTime,true);assert.equal(w.approvedBy,null);
 assert.equal(f.calls.otScope.where.companyId,'company-a');assert.equal(f.calls.otScope.where.OR[0].employeeId,'employee-a');assert.deepEqual(f.calls.ot.ids,['ot-a']);
});
test('selection cannot enable broad OT approval and empty selection is rejected',async()=>{
 const f=fixture();assert.equal((await f.send({recordIds:['record-a'],approveOvertime:true})).status,200);assert.equal(f.calls.ot,undefined);assert.equal((await f.send({recordIds:[]})).status,400);
});
test('read-only users cannot approve selected records',async()=>{const f=fixture(false);assert.equal((await f.send({recordIds:['record-a']})).status,403);assert.equal(f.calls.update,undefined)});
