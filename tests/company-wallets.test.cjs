const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { createHmac } = require('node:crypto')
const { NextRequest } = require('next/server')
function loader(overrides = {}) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    new Function('require', 'module', 'exports', code)(name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('@/') ? load('src/' + name.slice(2) + '.ts') : name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name), module, module.exports)
    return module.exports
  }
  return load
}
const policy = loader()('src/lib/disbursement/kyb-policy.ts')
const providerLib = loader()('src/lib/disbursement/provider.ts')
for (const [status, approved] of [['not_submitted', false], ['submitted', false], ['under_review', false], ['pending_clarification', false], ['declined', false], ['completed', true]]) {
  test(`Wallet page flags KYB ${status} correctly`, async () => {
    const { GET } = loader({
      '@/lib/disbursement/access': { walletAccess: async () => ({ ctx: { companyId: 'company', role: 'COMPANY_ADMIN' }, error: null }) },
      '@/lib/feature-gates': { checkHrisProAccess: async () => true },
      '@/lib/disbursement/wallet': { readyWallet: async () => { throw new Error('Wallet unavailable') } },
      '@/lib/prisma': { prisma: {
        company: { findUnique: async () => ({ disbursementBalance: 0 }) },
        disbursementTopUp: { findMany: async () => [] },
        companyPaymongoWallet: { findUnique: async query => {
          assert.equal(query.where.companyId, 'company')
          return { accountId: 'org_company', kybStatus: status, identityStatus: 'passed', activationStatus: 'activated' }
        } },
      } },
    })('src/app/api/disbursement/wallet/route.ts')
    const body = await (await GET()).json()
    assert.equal(body.kybRequired, !approved)
    assert.equal(body.canDisburse, false)
    assert.equal(body.canManageKyb, true)
  })
}
const ready = { activationStatus: 'activated', identityStatus: 'passed', kybStatus: 'completed', walletStatus: 'activated', walletType: 'default' }
for (const [key, value] of [
  ['activationStatus', 'pending'], ['identityStatus', 'passed_attestation_form'], ['kybStatus', 'processing'],
  ['kybStatus', 'pending_clarification'], ['kybStatus', 'declined'], ['walletStatus', 'frozen'],
  ['walletType', 'closed_loop'], ['walletType', 'unknown'], ['walletType', 'standard'],
]) test(`Disbursement blocked when ${key}=${value}`, () => assert.ok(policy.walletBlockReason({ ...ready, [key]: value })))
test('Only verified, activated external wallet is ready', () => assert.equal(policy.walletBlockReason(ready), null))
test('OPC and corporation require their own business documents', () => {
  assert.ok(policy.requiredDocuments('opc').includes('appointment_of_officers'))
  assert.ok(!policy.requiredDocuments('opc').includes('latest_gis'))
  assert.ok(policy.requiredDocuments('corporation').includes('latest_gis'))
  assert.ok(policy.requiredDocuments('sole_proprietor').includes('dti_registration'))
})
test('Provider pending, unknown, and processing never count as paid', () => {
  for (const status of ['pending', 'processing', '', 'unknown']) assert.equal(providerLib.transferState(status), 'PROCESSING')
  assert.equal(providerLib.transferState('succeeded'), 'COMPLETED')
  assert.equal(providerLib.transferState('failed'), 'FAILED')
  assert.equal(providerLib.batchState(['COMPLETED', 'PROCESSING']), 'PROCESSING')
  assert.equal(providerLib.batchState(['COMPLETED', 'FAILED']), 'PARTIAL')
  assert.equal(providerLib.batchState([]), 'PROCESSING')
})
test('Webhook signature requires correct tenant secret, mode, raw body and fresh timestamp', () => {
  const { verifySignature } = loader()('src/lib/disbursement/webhook.ts')
  const now = Date.now(), stamp = Math.floor(now / 1000), raw = '{"data":{"id":"evt1"}}'
  const sig = createHmac('sha256', 'tenant-secret').update(`${stamp}.${raw}`).digest('hex')
  const header = `t=${stamp},te=${sig},li=`
  assert.equal(verifySignature(raw, header, 'tenant-secret', false, now), true)
  assert.equal(verifySignature(raw, header, 'other-tenant', false, now), false)
  assert.equal(verifySignature(raw, header, 'tenant-secret', true, now), false)
  assert.equal(verifySignature(raw + ' ', header, 'tenant-secret', false, now), false)
  assert.equal(verifySignature(raw, header, 'tenant-secret', false, now + 301000), false)
})
test('Provider calls use persisted child account and idempotency headers', async () => {
  const oldFetch = global.fetch, oldKey = process.env.PAYMONGO_SECRET_KEY
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_unit'
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.paymongo.com/v2/batch_transfers')
    assert.equal(init.headers['Account-ID'], 'org_company')
    assert.equal(init.headers['Idempotency-Key'], 'durable-key')
    assert.equal(init.cache, 'no-store')
    return new Response(JSON.stringify({ data: { id: 'btr_test' } }), { status: 200 })
  }
  try { await providerLib.provider('POST', '/v2/batch_transfers', { accountId: 'org_company', idempotencyKey: 'durable-key', body: { transfers: [] } }) }
  finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.PAYMONGO_SECRET_KEY; else process.env.PAYMONGO_SECRET_KEY = oldKey }
})
for (const [role, onboarding, permission, allowed] of [
  ['EMPLOYEE', true, true, false], ['PAYROLL_OFFICER', true, true, false],
  ['COMPANY_ADMIN', true, true, true], ['EMPLOYEE', false, false, false],
  ['PAYROLL_OFFICER', false, true, true],
]) test(`Wallet access: ${role}, onboarding=${onboarding}`, async () => {
  const { walletAccess } = loader({
    '@/lib/api-auth': { requireAuth: async () => ({ ctx: { companyId: 'tenant', role }, error: null }) },
    '@/lib/hris-pro': { requireHrisProOrTrialApi: async () => null },
    '@/lib/auth/effective-permissions': { ctxHasPermission: async () => permission },
  })('src/lib/disbursement/access.ts')
  assert.equal((await walletAccess(onboarding)).error?.status ?? 200, allowed ? 200 : 403)
})
function transferHarness(initialStatus, response) {
  const item = { id: 'item', status: initialStatus, amount: 100, bankAccountNo: '123', bankBic: 'BANK', channel: 'instapay', employeeName: 'Employee' }
  const attempts = [], calls = []
  if (initialStatus === 'FAILED') attempts.push({ id: 'old', status: 'FAILED' })
  const batch = { id: 'batch', companyId: 'company', payrollRunId: 'run', pmAccountId: 'org_company', items: [item], status: 'PROCESSING' }
  const prisma = {
    payrollRun: { findFirst: async query => {
      assert.equal(query.where.companyId, 'company')
      return { id: 'run', status: 'APPROVED', periodLabel: 'October', disbursement: batch }
    } },
    payrollDisbursementItem: {
      updateMany: async ({ where, data }) => { if (item.status !== where.status) return { count: 0 }; Object.assign(item, data); return { count: 1 } },
      update: async ({ data }) => Object.assign(item, data),
      findMany: async () => [item],
    },
    disbursementTransferAttempt: {
      findFirst: async () => attempts.at(-1) ?? null,
      create: async ({ data }) => { const a = { id: 'new', status: 'PROCESSING', ...data }; attempts.push(a); return a },
      update: async ({ where, data }) => Object.assign(attempts.find(a => a.id === where.id), data),
    },
    payrollDisbursement: { update: async ({ data }) => Object.assign(batch, data) },
    $transaction: async fn => typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
  }
  const service = loader({
    '@/lib/prisma': { prisma },
    '@/lib/disbursement/wallet': { readyWallet: async () => ({ saved: { accountId: 'org_company' }, wallet: { balance: { available: 100000 } }, sourceAccount: { number: 'company-wallet', name: 'Company', bic: 'PM' } }) },
  })
  // Relative imports use a second override through the shared loader module cache.
  const p = service('src/lib/disbursement/provider.ts')
  p.provider = async (...args) => { calls.push(args); if (response instanceof Error) throw response; return response }
  const walletModule = service('src/lib/disbursement/wallet.ts')
  walletModule.readyWallet = async () => ({ saved: { accountId: 'org_company' }, wallet: { balance: { available: 100000 } }, sourceAccount: { number: 'company-wallet', name: 'Company', bic: 'PM' } })
  return { ...service('src/lib/disbursement/transfers.ts'), item, attempts, calls, batch }
}
test('Accepted pending transfer remains PROCESSING and is persisted with company source', async () => {
  const h = transferHarness('PENDING', { data: { id: 'btr1', transfers: [{ id: 'tr1', status: 'pending', amount: 10000, fee: 800 }] } })
  const result = await h.sendLinkedPayroll('company', 'user', 'run', true)
  assert.equal(result.status, 'PROCESSING'); assert.equal(h.item.status, 'PROCESSING')
  assert.equal(h.attempts[0].batchId, 'btr1')
  assert.equal(h.calls[0][2].accountId, 'org_company')
  assert.equal(h.calls[0][2].body.transfers[0].source_account.number, 'company-wallet')
  assert.equal(h.calls[0][2].idempotencyKey, h.attempts[0].idempotencyKey)
  assert.equal(h.attempts[0].feeCentavos, 800)
})
test('Timed-out transfer stays unresolved and cannot be resent', async () => {
  const h = transferHarness('PENDING', new Error('network timeout'))
  await h.sendLinkedPayroll('company', 'user', 'run', true)
  assert.equal(h.item.status, 'PROCESSING')
  await assert.rejects(() => h.sendLinkedPayroll('company', 'user', 'run', true), /cannot be resent/)
  assert.equal(h.calls.length, 1)
})
test('Confirmed failed transfer gets a new durable attempt and reference', async () => {
  const h = transferHarness('FAILED', { data: { id: 'btr2', transfers: [{ id: 'tr2', status: 'succeeded', amount: 10000 }] } })
  assert.equal((await h.sendLinkedPayroll('company', 'user', 'run', true)).status, 'COMPLETED')
  assert.equal(h.attempts.length, 2)
  assert.equal(h.attempts[0].status, 'FAILED')
  assert.equal(h.attempts[1].status, 'COMPLETED')
})
test('Missing provider transfer record is unresolved, not failed or paid', async () => {
  const h = transferHarness('PENDING', { data: { id: 'btr1', transfers: [] } })
  assert.equal((await h.sendLinkedPayroll('company', 'user', 'run', true)).status, 'PROCESSING')
  assert.equal(h.item.status, 'PROCESSING')
})
test('Draft cannot be saved without company administrator consent', async () => {
  let writes = 0
  const load = loader({
    '@/lib/prisma': { prisma: { companyPaymongoWallet: { findUnique: async () => null, create: async () => { writes++ } } } },
    '@/lib/disbursement/access': { walletAccess: async () => ({ ctx: { companyId: 'company', userId: 'admin' }, error: null }) },
    '@/lib/disbursement/provider': { ...providerLib, onboardingConfigured: () => true },
  })
  const res = await load('src/app/api/disbursement/onboarding/route.ts').POST(new NextRequest('http://localhost/api/disbursement/onboarding', { method: 'POST', body: JSON.stringify({ action: 'save', profile: {}, companyId: 'other' }) }))
  assert.equal(res.status, 400); assert.equal(writes, 0)
})
test('Sensitive KYB profile is authenticated encryption, not plaintext storage', () => {
  const old = process.env.PAYMONGO_KYB_ENCRYPTION_KEY
  process.env.PAYMONGO_KYB_ENCRYPTION_KEY = 'a'.repeat(64)
  try {
    const { seal, unseal } = loader()('src/lib/disbursement/crypto.ts')
    const cipher = seal({ tin: '123456789', name: 'Private Representative' })
    assert.ok(!cipher.includes('Private Representative'))
    assert.equal(unseal(cipher).tin, '123456789')
    process.env.PAYMONGO_KYB_ENCRYPTION_KEY = 'b'.repeat(64)
    assert.throws(() => unseal(cipher))
  } finally { if (old === undefined) delete process.env.PAYMONGO_KYB_ENCRYPTION_KEY; else process.env.PAYMONGO_KYB_ENCRYPTION_KEY = old }
})
for (const mismatch of ['reference', 'source', 'destination', 'amount', 'tenant']) test(`Reconciliation rejects mismatched ${mismatch} without sending money`, async () => {
  let writes = 0
  const original = { amount: 10000, source_account: { number: 'company' }, destination_account: { number: 'employee', bic: 'BANK' } }
  const transfer = { ...original, id: 'tr1', status: 'succeeded', reference_number: 'key' }
  if (mismatch === 'reference') transfer.reference_number = 'wrong'
  if (mismatch === 'source') transfer.source_account = { number: 'other-company' }
  if (mismatch === 'destination') transfer.destination_account = { number: 'other-person', bic: 'BANK' }
  if (mismatch === 'amount') transfer.amount = 20000
  const load = loader({
    '@/lib/disbursement/access': { walletAccess: async () => ({ ctx: { companyId: 'tenant' }, error: null }) },
    '@/lib/prisma': { prisma: {
      payrollDisbursementItem: { findFirst: async query => {
        assert.equal(query.where.disbursement.companyId, 'tenant')
        if (mismatch === 'tenant') return null
        return { id: 'item', status: 'PROCESSING', attempts: [{ id: 'attempt', accountId: 'org_tenant', status: 'PROCESSING', idempotencyKey: 'key', payload: { transfers: [original] } }], disbursementId: 'batch' }
      } },
      companyPaymongoWallet: { findUnique: async () => ({ accountId: 'org_tenant', livemode: false }) },
      $transaction: async () => { writes++ },
    } },
    '@/lib/disbursement/provider': { ...providerLib, providerMode: () => false, provider: async (method, path, options) => {
      assert.equal(method, 'GET'); assert.equal(options.accountId, 'org_tenant')
      return { data: { id: 'btr_123', transfers: [transfer] } }
    } },
    '@/lib/disbursement/transfers': { refreshBatch: async () => { writes++ } },
  })
  const res = await load('src/app/api/disbursement/[runId]/reconcile/route.ts').POST(new NextRequest('http://localhost/api/disbursement/run/reconcile', { method: 'POST', body: JSON.stringify({ payslipId: 'payslip', batchId: 'btr_123', companyId: 'attacker' }) }), { params: Promise.resolve({ runId: 'run' }) })
  assert.equal(res.status, 409)
  assert.equal(writes, 0)
})
