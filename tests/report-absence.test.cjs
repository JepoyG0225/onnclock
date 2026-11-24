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





const missing=loader()('src/lib/attendance/report-absence.ts').missingAttendanceDays;
const date=s=>new Date(s+'T00:00:00Z');
const employee={id:'e',hireDate:date('2026-01-01'),terminationDate:null,isActive:true,trackTime:true,workSchedule:{workDays:[1,2,3,4,5],timeIn:'08:00',timeOut:'17:00'}};
const range={gte:date('2026-11-02'),lt:date('2026-11-06')},now=new Date('2026-11-05T10:00:00Z');
test('missing scheduled days count without requests; today and future do not',()=>{assert.deepEqual(missing([employee],[],[],[],[],range,now).map(r=>r.date.toISOString().slice(0,10)),['2026-11-02','2026-11-03','2026-11-04'])});
test('approved leave and holidays are separated from absences',()=>{const rows=missing([employee],[],[],[{employeeId:'e',startDate:date('2026-11-02'),endDate:date('2026-11-02'),isHalfDay:false},{employeeId:'e',startDate:date('2026-11-03'),endDate:date('2026-11-03'),isHalfDay:true}],[date('2026-11-04')],range,now);assert.deepEqual(rows.map(r=>[r.absentDays,r.leaveDays]),[[0,1],[0.5,0.5]])});
test('rest overrides, punches, employment boundaries and tracking exclusions',()=>{const rows=missing([employee],[{employeeId:'e',date:date('2026-11-02'),timeIn:date('2026-11-02')}],[{employeeId:'e',date:date('2026-11-03'),isRestDay:true}],[],[],range,now);assert.equal(rows.length,1);assert.equal(missing([{...employee,trackTime:false}],[],[],[],[],range,now).length,0);assert.equal(missing([{...employee,hireDate:date('2026-11-04')}],[],[],[],[],range,now).length,1)});
test('overnight shift is not absent before its end',()=>{assert.equal(missing([{...employee,workSchedule:{workDays:[3],timeIn:'22:00',timeOut:'08:00'}}],[],[],[],[],range,new Date('2026-11-04T23:00:00Z')).length,0)});
