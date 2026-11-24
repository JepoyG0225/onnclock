const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs'), path = require('path'), ts = require('typescript')
function loader(overrides = {}) {
  function load(file) {
    const module = { exports: {} }
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    new Function('require', 'module', 'exports', code)(name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('@/') ? load('src/' + name.slice(2) + '.ts') : require(name), module, module.exports)
    return module.exports
  }
  return load
}
const { productRelease: releaseAt, UPDATE_STARTS_AT, UPDATE_EXPIRES_AT } = loader()('src/lib/product-updates.ts')
const productRelease=(role,permissions)=>releaseAt(role,permissions,new Date(UPDATE_STARTS_AT))
test('employees see employee updates without administrator report or settings instructions', () => {
  const release = productRelease('EMPLOYEE', [])
  assert.equal(release.updates.length, 5)
  assert.ok(release.updates.some(u => u.title === 'Offline Attendance'))
  assert.ok(!release.updates.some(u => /reports|settings/.test(u.title)))
})
test('administrator notices respect custom permissions', () => {
  const release = productRelease('HR_MANAGER', ['payroll:read'])
  assert.deepEqual(release.updates.map(u => u.title), ['Rest-Day Shift Approval', 'Employee Overtime Controls'])
  assert.equal(productRelease('HR_MANAGER', []).updates.length, 0)
})
function harness(ctx = { userId: 'user', companyId: 'company', role: 'EMPLOYEE' }, permissions = [], expired = false) {
  const receipts = new Set()
  const { POST } = loader({
    '@/lib/product-updates': { productRelease: expired ? () => null : productRelease },
    '@/lib/api-auth': { requireAuth: async () => ({ ctx, error: null }) },
    '@/lib/auth/effective-permissions': { getEffectivePermissions: async () => permissions },
    '@/lib/prisma': { prisma: { userUpdateReceipt: { createMany: async ({ data, skipDuplicates }) => {
      assert.equal(skipDuplicates, true)
      assert.equal(data[0].userId, ctx.userId)
      const key = data[0].userId + ':' + data[0].releaseId
      if (receipts.has(key)) return { count: 0 }
      receipts.add(key); return { count: 1 }
    } } } },
  })('src/app/api/product-updates/route.ts')
  return { POST, receipts }
}
test('first view returns announcement; refresh and concurrent tabs return it only once', async () => {
  const h = harness()
  const responses = await Promise.all(Array.from({ length: 5 }, async () => (await h.POST()).json()))
  assert.equal(responses.filter(r => r.release).length, 1)
  assert.equal(h.receipts.size, 1)
  assert.equal((await (await h.POST()).json()).release, null)
})
test('preview sessions do not consume employee announcement receipts', async () => {
  const h = harness({ userId: 'employee', companyId: 'company', role: 'EMPLOYEE', actorRole: 'SUPER_ADMIN' })
  assert.equal((await (await h.POST()).json()).release, null)
  assert.equal(h.receipts.size, 0)
})
test('empty permission-filtered announcement is not marked seen', async () => {
  const h = harness({ userId: 'restricted', companyId: 'company', role: 'HR_MANAGER' })
  assert.equal((await (await h.POST()).json()).release, null)
  assert.equal(h.receipts.size, 0)
})

test('full-permission HR administrators see all six additions', () => {
  const release = productRelease('COMPANY_ADMIN', ['dtr:read','employees:write','expenses:read','approvals:manage'])
  assert.equal(release.updates.length, 6)
  assert.equal(release.spotlight, undefined)
})
test('release lasts exactly three days and excludes the expiry instant', () => {
  assert.equal(Date.parse(UPDATE_EXPIRES_AT)-Date.parse(UPDATE_STARTS_AT), 3*86400000)
  assert.equal(releaseAt('EMPLOYEE',[],new Date(Date.parse(UPDATE_STARTS_AT)-1)), null)
  assert.ok(releaseAt('EMPLOYEE',[],new Date(Date.parse(UPDATE_EXPIRES_AT)-1)))
  assert.equal(releaseAt('EMPLOYEE',[],new Date(UPDATE_EXPIRES_AT)),null)
})
test('expired releases do not show or create receipts', async () => {
  const h = harness(undefined, [], true)
  assert.equal((await (await h.POST()).json()).release, null)
  assert.equal(h.receipts.size, 0)
})
