const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
function load(file, overrides) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(overrides, name) ? overrides[name]
    : name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts'), overrides)
    : require(name), module, module.exports)
  return module.exports
}
Object.assign(process.env, { PAYMONGO_AUTOMATIC_TOPUPS_ENABLED: 'true',
  PAYMONGO_MAIN_WALLET_ID: 'walletMain', PAYMONGO_PARENT_ACCOUNT_ID: 'org_parent',
  PAYMONGO_TOPUP_TRANSFER_FEE_CENTAVOS: '0' })
function harness(options = {}) {
  const source = { number: '100', bic: 'PAYBIC', name: 'Main' }
  const destination = { number: '200', bic: 'PAYBIC', name: 'Company' }
  let tick = Date.now()
  let row = {
    id: 'a'.repeat(32), companyId: 'company', amountCentavos: 100000, feePolicy: options.feePolicy ?? 'NET',
    parentAccountId: 'org_parent', accountId: 'org_child', walletId: 'walletChild',
    sourceAccount: source, destinationAccount: destination, livemode: false, status: 'PAYMENT_PENDING',
    checkoutId: 'cs_checkout', paymentId: null, payoutId: null, payoutCursor: null, batchId: null,
    transferId: null, transferFee: 0, processingUntil: null, payload: null, createdAt: new Date(tick),
    updatedAt: new Date(tick), ...options.row,
  }
  const copy = () => structuredClone(row)
  const payment = { id: 'pay_payment', attributes: { amount: 100000, currency: 'PHP', livemode: false,
    status: 'paid', payout: { id: 'po_payout' }, refunds: [], ...options.payment } }
  const checkout = { id: 'cs_checkout', attributes: {
    checkout_url: 'https://checkout.paymongo.com/checkout', reference_number: row.id, livemode: false,
    metadata: { companyId: 'company', fundingId: row.id },
    line_items: [{ amount: 100000, quantity: 1, currency: 'PHP' }],
    status: 'active', payments: options.unpaid ? [] : [payment], ...options.checkout,
  } }
  const payout = { id: 'po_payout', attributes: { status: 'deposited', currency: 'PHP',
    bank_account_number: '100', organization: { id: 'org_parent' }, ...options.payout } }
  const settlement = { id: 'pay_payment', type: 'payment', attributes: {
    amount: 100000, net_amount: 98000, currency: 'PHP', livemode: false,
    organization_id: 'org_parent', payout_id: 'po_payout', ...options.settlement,
  } }
  const calls = []
  function matches(where) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return value.some(matches)
      if (value instanceof Date) return +row[key] === +value
      if (value && typeof value === 'object') {
        if (value.in) return value.in.includes(row[key])
        if (value.lt) return row[key] !== null && row[key] < value.lt
      }
      return row[key] === value
    })
  }
  const db = {
    findUnique: async ({ where }) => row && row.id === where.id ? copy() : null,
    findUniqueOrThrow: async () => copy(),
    findFirstOrThrow: async ({ where }) => { if (!matches(where)) throw new Error('Not found'); return copy() },
    updateMany: async ({ where, data }) => {
      if (!matches(where)) return { count: 0 }
      row = { ...row, ...data, updatedAt: new Date(++tick) }; return { count: 1 }
    },
    update: async ({ data }) => { row = { ...row, ...data, updatedAt: new Date(++tick) }; return copy() },
    create: async ({ data }) => { row = { ...row, ...data, checkoutId: null, status: 'CREATING' }; return copy() },
  }
  let posts = 0
  function batch() {
    return { id: 'btr_batch', transfers: [{ id: 'tr_transfer', reference_number: row.id,
      amount: row.creditCentavos, currency: 'PHP', provider: 'paymongo', fee: 0,
      source_account: source, destination_account: destination, status: options.transferStatus ?? 'succeeded',
      ...options.transfer,
    }] }
  }
  const provider = async (method, url, args = {}) => {
    calls.push({ method, url, args })
    assert.equal(args.accountId, undefined, 'funding calls must use parent context')
    if (method === 'POST') {
      posts++
      if (options.timeout) throw new Error('timeout')
      if (url === '/v1/checkout_sessions') return { data: checkout }
      assert.equal(url, '/v2/batch_transfers')
      assert.equal(args.idempotencyKey, 'fund' + row.id)
      return { data: batch() }
    }
    if (url.startsWith('/v1/checkout_sessions/')) return { data: checkout }
    if (url.startsWith('/v1/payouts/po_payout/transactions')) return {
      data: options.emptyPage && !url.includes('&after=') ? [] : [settlement],
      pagination: { next_cursor: options.emptyPage && !url.includes('&after=') ? 'next' : null },
    }
    if (url === '/v1/payouts/po_payout') return { data: payout }
    if (url.startsWith('/v2/batch_transfers/')) return { data: batch() }
    if (url.startsWith('/v2/wallets?')) return { data: [{
      id: 'walletMain', merchant_id: 'org_parent', livemode: false, status: 'activated',
      account: { currency: 'PHP' }, source_account: source, balance: { available: options.balance ?? 1000000 },
    }] }
    throw new Error('Unexpected provider call ' + url)
  }
  const lib = load('src/lib/disbursement/funding.ts', {
    '@/lib/prisma': { prisma: { walletFunding: db } },
    './provider': { provider, onboardingConfigured: () => true, providerMode: () => false },
    './wallet': { readyWallet: async () => {
      if (options.kybBlocked) throw new Error('KYB blocked')
      return { saved: { accountId: 'org_child' }, wallet: { id: 'walletChild' }, sourceAccount: destination }
    } },
  })
  return { lib, calls, row: copy, posts: () => posts, db }
}
test('settled top-up credits net amount once; replay cannot transfer again', async () => {
  const h = harness()
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().status, 'COMPLETED')
  assert.equal(h.row().creditCentavos, 98000)
  assert.equal(h.row().netCentavos, 98000)
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.posts(), 1)
})
test('concurrent workers claim only one transfer', async () => {
  const h = harness()
  await Promise.all(Array.from({ length: 10 }, () => h.lib.advanceFunding(h.row().id)))
  assert.equal(h.posts(), 1)
  assert.equal(h.row().status, 'COMPLETED')
})
test('gross fee policy credits full amount with actual net retained', async () => {
  const h = harness({ feePolicy: 'GROSS' })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().creditCentavos, 100000)
  assert.equal(h.row().netCentavos, 98000)
})
test('payment fees and forwarding fee are both deducted before wallet transfer', async () => {
  const h = harness({ row: { transferFee: 500 }, transfer: { fee: 500 } })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().status, 'COMPLETED')
  assert.equal(h.row().creditCentavos, 97500)
  const data = h.lib.publicFunding(h.row())
  assert.equal(data.paymentFeesPeso, 20)
  assert.equal(data.transferFeePeso, 5)
  assert.equal(data.creditPeso, 975)
  assert.equal(data.amountPeso, data.paymentFeesPeso + data.transferFeePeso + data.creditPeso)
})
test('actual fee mismatch requires reconciliation and never resends succeeded transfer', async () => {
  const h = harness({ row: { transferFee: 500 }, transfer: { fee: 600 } })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().status, 'REVIEW')
  assert.match(h.row().error, /Transfer succeeded/)
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.posts(), 1)
})
test('missing actual fee cannot silently mark funding reconciled', async () => {
  const h = harness({ transfer: { fee: undefined } })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().status, 'REVIEW')
})
test('settlement must cover forwarding fee with positive remaining credit', async () => {
  const h = harness({ row: { transferFee: 98000 } })
  await assert.rejects(h.lib.advanceFunding(h.row().id), /does not cover/)
  assert.equal(h.posts(), 0)
})
test('main balance must cover credit plus the forwarding fee', async () => {
  const h = harness({ row: { transferFee: 500 }, transfer: { fee: 500 }, balance: 97600 })
  await assert.rejects(h.lib.advanceFunding(h.row().id), /sufficient main wallet/)
  assert.equal(h.posts(), 0)
})
test('paid without payout waits even with abundant main balance', async () => {
  const h = harness({ payment: { payout: null } })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.posts(), 0)
  assert.equal(h.row().status, 'SETTLING')
})
test('payout in transit cannot fund company wallet', async () => {
  const h = harness({ payout: { status: 'in_transit' } })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.posts(), 0)
})
for (const [name, options] of [
  ['wrong bank destination', { payout: { bank_account_number: '999' } }],
  ['wrong parent organization', { payout: { organization: { id: 'org_other' } } }],
  ['wrong settlement mode', { settlement: { livemode: true } }],
  ['wrong gross amount', { settlement: { amount: 99999 } }],
  ['negative settlement', { settlement: { net_amount: -1 } }],
  ['wrong payout linkage', { settlement: { payout_id: 'po_other' } }],
  ['KYB revoked', { kybBlocked: true }],
  ['insufficient main balance', { balance: 100 }],
]) test(name + ' prevents forwarding', async () => {
  const h = harness(options)
  await assert.rejects(h.lib.advanceFunding(h.row().id))
  assert.equal(h.posts(), 0)
})
test('settlement pagination persists and continues instead of assuming no payment', async () => {
  const h = harness({ emptyPage: true })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().payoutCursor, 'next')
  assert.equal(h.posts(), 0)
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.posts(), 1)
})
test('timeout holds unresolved transfer permanently; repeated polling never resends', async () => {
  const h = harness({ timeout: true })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().status, 'TRANSFERRING')
  assert.equal(h.row().batchId, null)
  await h.lib.advanceFunding(h.row().id)
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.posts(), 1)
  assert.equal(h.row().completedAt, undefined)
})
test('pending provider transfer remains pending until subsequent confirmed success', async () => {
  const options = { transferStatus: 'pending' }, h = harness(options)
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().status, 'TRANSFERRING')
  assert.equal(h.row().completedAt, null)
  options.transferStatus = 'succeeded'
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().status, 'COMPLETED')
  assert.equal(h.posts(), 1)
})
test('provider transfer destination mismatch never marks credit complete', async () => {
  const h = harness({ transfer: { destination_account: { number: '999', bic: 'PAYBIC' } } })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().status, 'TRANSFERRING')
  assert.ok(h.row().error)
})
test('refund and dispute payments go to reconciliation without forwarding', async () => {
  for (const payment of [{ refunds: [{ id: 'refund' }] }, { disputed: true }]) {
    const h = harness({ payment })
    await h.lib.advanceFunding(h.row().id)
    assert.equal(h.row().status, 'REVIEW')
    assert.equal(h.posts(), 0)
  }
})
test('paid checkout is processed before an expired checkout status', async () => {
  const h = harness({ checkout: { status: 'expired' } })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.row().status, 'COMPLETED')
})
test('unpaid checkout is never forwarded', async () => {
  const h = harness({ unpaid: true })
  await h.lib.advanceFunding(h.row().id)
  assert.equal(h.posts(), 0)
  assert.equal(h.row().status, 'PAYMENT_PENDING')
})
test('same request replay returns existing record and rejects other tenant/amount', async () => {
  const h = harness()
  await h.lib.createFunding('company', 'user', h.row().id, 100000)
  await assert.rejects(h.lib.createFunding('other', 'user', h.row().id, 100000))
  await assert.rejects(h.lib.createFunding('company', 'user', h.row().id, 99999))
  assert.equal(h.posts(), 0)
})
test('unknown transfer can be reconciled by read-only provider reference', async () => {
  const h = harness({ timeout: true })
  await h.lib.advanceFunding(h.row().id)
  await h.lib.reconcileFunding('company', h.row().id, 'btr_batch')
  assert.equal(h.row().status, 'COMPLETED')
  assert.equal(h.posts(), 1)
})
test('tenant cannot reconcile another company top-up', async () => {
  const h = harness()
  await assert.rejects(h.lib.reconcileFunding('other', h.row().id, 'btr_batch'))
  assert.equal(h.calls.length, 0)
})
test('provider reference normalization accepts UUID spaces but not different references', () => {
  const { sameTransferReference } = load('src/lib/disbursement/provider.ts', {})
  assert.equal(sameTransferReference('abc def', 'abc-def'), true)
  assert.equal(sameTransferReference('abcdef', 'abc-def'), false)
  assert.equal(sameTransferReference(undefined, 'abc-def'), false)
})
test('new checkout is recorded before provider call and replay reuses it', async () => {
  const h = harness({ unpaid: true })
  const find = h.db.findUnique
  let first = true
  h.db.findUnique = async query => { if (first) { first = false; return null }; return find(query) }
  const created = await h.lib.createFunding('company', 'user', h.row().id, 100000)
  assert.equal(created.status, 'PAYMENT_PENDING')
  assert.equal(h.row().checkoutId, 'cs_checkout')
  await h.lib.createFunding('company', 'user', h.row().id, 100000)
  assert.equal(h.posts(), 1)
})
test('lost checkout response is held for reconciliation and never creates a replacement', async () => {
  const h = harness({ timeout: true })
  const find = h.db.findUnique
  let first = true
  h.db.findUnique = async query => { if (first) { first = false; return null }; return find(query) }
  await h.lib.createFunding('company', 'user', h.row().id, 100000)
  assert.equal(h.row().status, 'REVIEW')
  await h.lib.createFunding('company', 'user', h.row().id, 100000)
  assert.equal(h.posts(), 1)
  await h.lib.reconcileFunding('company', h.row().id, 'cs_checkout')
  assert.equal(h.row().status, 'PAYMENT_PENDING')
  assert.equal(h.posts(), 1)
})
