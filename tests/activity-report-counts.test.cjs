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


const {ReportPages}=loader()('src/components/attendance/AttendanceReports.tsx')
const employee={id:'e',employeeNo:'E1',firstName:'Ana',lastName:'Cruz',department:null}
const record={id:'r',employeeId:'e',date:'2026-11-14',timeIn:'2026-11-14T01:00:00Z',timeOut:'2026-11-14T09:00:00Z',regularHours:8,overtimeHours:0,lateMinutes:0,undertimeMinutes:0,isAbsent:false,isLeave:false,activities:[1,2].map(n=>({id:String(n),dailyNumber:n,loggedAt:'2026-11-14T02:00:00Z',description:'Work',photoUrl:null}))}
const data={employees:[employee],records:[record],companyName:'Example',month:'2026-11',generatedAt:'2026-11-14T10:00:00Z'}
test('daily attendance table shows log counts including zero',()=>{
 const html=renderToStaticMarkup(React.createElement(ReportPages,{data:{...data,records:[record,{...record,id:'r2',activities:[]}]},type:'daily'}))
 assert.match(html,/Activity logs/);assert.match(html,/<td>2<\/td>/);assert.match(html,/<td>0<\/td>/)
})
test('daily activity report displays day and report-period totals',()=>{
 const html=renderToStaticMarkup(React.createElement(ReportPages,{data,type:'activities'}))
 assert.match(html,/Total activity logs for this day: 2/);assert.match(html,/Total in report period: 2/)
})
