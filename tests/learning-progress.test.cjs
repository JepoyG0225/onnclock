const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { Prisma } = require('@prisma/client')

// Transpile the actual TypeScript modules and inject only infrastructure boundaries.
// No test database, credentials, network, or changes to production data are needed.
function loader(overrides = {}) {
  overrides = { '@/lib/hris-pro': { requireHrisProOrTrialApi: async () => null }, ...overrides }
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name]
      if (name.startsWith('@/')) return load(path.join('src', name.slice(2)) + '.ts')
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts')
      return require(name)
    }
    new Function('require', 'module', 'exports', source)(localRequire, module, module.exports)
    return module.exports
  }
  return load
}

const { summarizeLearningProgress: summarize } = loader()('src/lib/learning/progress.ts')
const time = new Date('2026-10-15T01:00:00Z')
test('progress counts only current unique lessons and detects activity', () => {
  const result = summarize('ASSIGNED', ['a', 'b', 'c'], [
    { lessonId: 'a', status: 'COMPLETED', updatedAt: time },
    { lessonId: 'a', status: 'COMPLETED', updatedAt: time },
    { lessonId: 'deleted', status: 'COMPLETED', updatedAt: time },
  ])
  assert.equal(result.completedLessons, 1)
  assert.equal(result.percent, 33)
  assert.equal(result.status, 'IN_PROGRESS')
})
test('manual completion does not invent completed lessons; empty courses have no percentage', () => {
  assert.equal(summarize('COMPLETED', ['a'], []).percent, 0)
  assert.equal(summarize('COMPLETED', ['a'], []).status, 'COMPLETED')
  assert.equal(summarize('ASSIGNED', [], []).percent, null)
  assert.equal(summarize('ASSIGNED', ['a'], []).status, 'ASSIGNED')
})
test('quiz activity starts progress while cancelled state remains intact', () => {
  assert.equal(summarize('ASSIGNED', ['a'], [], time).status, 'IN_PROGRESS')
  assert.equal(summarize('CANCELLED', ['a'], [], time).status, 'CANCELLED')
  assert.equal(summarize('ASSIGNED', ['a'], [], time).lastActivityAt, time.toISOString())
})
for (const role of ['EMPLOYEE', 'HR_MANAGER']) test(`learning summary retains company and employee scope for ${role}`, async () => {
  let query
  const load = loader({
    '@/lib/api-auth': { requireAuth: async () => ({ ctx: { companyId: 'company', userId: 'user', role } }) },
    '@/lib/auth/effective-permissions': { ctxHasPermission: async () => role === 'HR_MANAGER' },
    '@/lib/audit': { logAudit: async () => {} },
    '@/lib/prisma': { prisma: {
      employee: { findFirst: async () => ({ id: 'employee' }), findMany: async () => [] },
      employeeCertification: { findMany: async () => [] },
      certificateTemplate: { findMany: async () => [] },
      learningCourse: { findMany: async args => { query = args; return [{ id: 'course', modules: [{ lessons: [{ id: 'a' }] }], enrollments: [{ id: 'enrollment', status: 'ASSIGNED', progress: [{ lessonId: 'a', status: 'COMPLETED', updatedAt: time }], attempts: [] }] }] } },
    } },
  })
  const response = await load('src/app/api/learning/route.ts').GET()
  const data = await response.json()
  assert.equal(query.where.companyId, 'company')
  assert.equal(query.include.enrollments.where.employee.companyId, 'company')
  if (role === 'EMPLOYEE') assert.equal(query.include.enrollments.where.employeeId, 'employee')
  assert.equal(data.courses[0].enrollments[0].learningProgress.percent, 100)
  assert.equal(data.courses[0].enrollments[0].progress, undefined)
  assert.equal(data.courses[0].modules, undefined)
})

for (const [price, trial, allowed] of [[50,false,false],[70,false,false],[100,false,true],[150,false,true],[0,true,true]]) {
  test(`learning access: seat ${price}, trial ${trial}, allowed ${allowed}`, async()=>{
    const auth={requireAuth:async()=>({ctx:{companyId:'company',role:'EMPLOYEE'},error:null})}
    const gates={PLAN_PRICE:{HRIS_PRO:100},getCompanySubscription:async()=>({pricePerSeat:price,isTrial:trial}),hasHrisProFeature:p=>p>=100}
    const hris=loader({'@/lib/feature-gates':gates})('src/lib/hris-pro.ts')
    const access=loader({'@/lib/api-auth':auth,'@/lib/hris-pro':hris})('src/lib/learning/access.ts')
    const result=await access.requireLearningAuth()
    assert.equal(result.error?.status??200,allowed?200:403)
  })
}
