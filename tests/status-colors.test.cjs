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








test('statuses have distinct colors and readable white text',()=>{const {STATUS_BADGE_COLORS}=loader()('src/lib/status-colors.ts');assert.equal(new Set(Object.values(STATUS_BADGE_COLORS)).size,Object.keys(STATUS_BADGE_COLORS).length);for(const [status,hex] of Object.entries(STATUS_BADGE_COLORS)){const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);const lum=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];assert.ok(1.05/(lum+.05)>=4.5,status+' white text contrast')}})
test('badge labels and legacy status helper use the same specific palette',()=>{const load=loader();const {Badge}=load('src/components/ui/badge.tsx');const {getStatusColor}=load('src/lib/utils.ts');for(const status of ['Approved','Pending','Computed','Locked','Disbursed','Cancelled','For Approval']){const markup=renderToStaticMarkup(React.createElement(Badge,{variant:'success',className:'bg-green-100'},status));assert.ok(markup.includes(getStatusColor(status)),status)}const unknown=renderToStaticMarkup(React.createElement(Badge,null,'EMP-001'));assert.ok(!unknown.includes('record-status-'))})
