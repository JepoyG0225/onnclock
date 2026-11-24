const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createAutomaticUpdates, acceptsSignature, verifyPublisher } = require('../desktop-app-employee/automatic-updates')

function setup(canInstall = async () => false) {
  const updater = new EventEmitter()
  let installs = 0
  const states = []
  updater.quitAndInstall = (...args) => { assert.deepEqual(args, [true, true]); installs++ }
  updater.checkForUpdates = async () => ({})
  const controller = createAutomaticUpdates({ updater, canInstall, install: run => run(), onState: s => states.push(s), onProgress() {}, log() {} })
  return { controller, updater, states, installs: () => installs }
}

test('downloads automatically but never installs merely because the app exits', () => {
  const { updater } = setup()
  assert.equal(updater.autoDownload, true)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.allowDowngrade, false)
})
test('active or unverifiable attendance postpones installation', async () => {
  const { controller, updater, installs } = setup()
  updater.emit('update-downloaded', { version: '1.1.20' })
  assert.equal(await controller.tryInstall(), false)
  assert.equal(installs(), 0)
})
test('off-shift installs exactly once and relaunches silently', async () => {
  const { controller, updater, installs } = setup(async () => true)
  assert.equal(await controller.tryInstall(), false)
  updater.emit('update-downloaded', { version: '1.1.20' })
  await Promise.all([controller.tryInstall(), controller.tryInstall()])
  assert.equal(installs(), 1)
})
test('offline check failure can recover without quitting', async () => {
  let online = false
  const { controller, updater, installs } = setup(async () => { if (!online) throw Error('offline'); return true })
  updater.emit('update-downloaded', { version: '1.1.20' })
  assert.equal(await controller.tryInstall(), false)
  online = true
  assert.equal(await controller.tryInstall(), true)
  assert.equal(installs(), 1)
})
test('concurrent checks share one request; download failures remain retryable', async () => {
  const { controller, updater } = setup()
  let calls = 0
  updater.checkForUpdates = async () => { calls++; throw Error('offline') }
  await Promise.all([controller.check(), controller.check()])
  assert.equal(calls, 1)
  await controller.check()
  assert.equal(calls, 2)
})
test('rejects wrong publishers, unsigned files, tampering and other trust failures', () => {
  const valid = { thumbprint: '94E1D3367948AE15DBF132D8305E99FB9C56DD7A', status: 'Valid' }
  assert.equal(acceptsSignature(valid), true)
  assert.equal(acceptsSignature({ ...valid, status: 'HashMismatch', untrustedRootOnly: true }), false)
  assert.equal(acceptsSignature({ ...valid, status: 'NotSigned' }), false)
  assert.equal(acceptsSignature({ ...valid, thumbprint: 'OTHER' }), false)
  assert.equal(acceptsSignature({ ...valid, status: 'UnknownError', untrustedRootOnly: false }), false)
  assert.equal(acceptsSignature({ ...valid, status: 'UnknownError', untrustedRootOnly: true }), true)
})
test('existing signed installer passes the pinned publisher check', { skip: process.platform !== 'win32' }, async () => {
  const path = require('node:path').resolve(__dirname, '../desktop-app-employee/dist/OnClock Desktop Setup 1.1.18.exe')
  if (!require('node:fs').existsSync(path)) return
  assert.equal(await verifyPublisher([], path), null)
})
