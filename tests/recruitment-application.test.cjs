const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function loader(overrides = {}) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    new Function('require', 'module', 'exports', source)(name => {
      if (Object.hasOwn(overrides, name)) return overrides[name]
      if (name.startsWith('@/')) return load(path.join('src', name.slice(2)) + '.ts')
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts')
      return require(name)
    }, module, module.exports)
    return module.exports
  }
  return load
}
const { resumeFileType, applicationResponse, MAX_RESUME_BYTES } = loader()('src/lib/recruitment-upload.ts')
const job = { id: 'job', companyId: 'company' }
const applicant = 'test@example.com'
const file = { name: 'Resume.pdf', type: 'application/pdf', size: MAX_RESUME_BYTES }

test('résumé accepts 10 MB and iOS files with missing MIME; rejects invalid/empty/oversized files', () => {
  assert.equal(resumeFileType(file).mime, 'application/pdf')
  assert.equal(resumeFileType({ ...file, type: '' }).mime, 'application/pdf')
  assert.equal(resumeFileType({ ...file, name: 'Resume.DOCX', type: 'application/octet-stream' }).extension, 'docx')
  for (const bad of [{ size: MAX_RESUME_BYTES + 1 }, { size: 0 }, { name: 'script.html' }, { type: 'text/html' }]) {
    assert.throws(() => resumeFileType({ ...file, ...bad }))
  }
})
test('HTML/empty hosting errors produce useful messages, never raw JSON parsing errors', async () => {
  await assert.rejects(applicationResponse(new Response('<html>Error</html>', { status: 500 })), /temporarily unavailable/)
  await assert.rejects(applicationResponse(new Response('FUNCTION_PAYLOAD_TOO_LARGE', { status: 413 })), /too large/)
  await assert.rejects(applicationResponse(new Response('', { status: 200 })), /unexpected response/)
  await assert.rejects(applicationResponse(new Response(JSON.stringify({ error: 'This job is closed' }), { status: 409 })), /This job is closed/)
  assert.deepEqual(await applicationResponse(new Response('{"application":{"id":"saved"}}', { status: 201 })), { application: { id: 'saved' } })
})

function storageFixture() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-signing-key-not-a-real-credential'
  let bucketOptions
  const object = { size: file.size, contentType: file.type }
  const storage = {
    getBucket: async () => ({ data: { public: false }, error: null }),
    createBucket: async (_name, options) => { bucketOptions = options; return { error: null } },
    from: () => ({
      createSignedUploadUrl: async (path, options) => { assert.equal(options.upsert, false); return { data: { signedUrl: `https://storage.example/upload/${path}?token=test` }, error: null } },
      info: async () => ({ data: object, error: null }),
    }),
  }
  const lib = loader({ '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ storage }) } })('src/lib/recruitment-resume-storage.ts')
  return { lib, storage, object, bucketOptions: () => bucketOptions }
}
test('private storage issues direct upload and verifies file before storing durable reference', async () => {
  const f = storageFixture()
  const ticket = await f.lib.issueResumeUpload(job, applicant, file)
  assert.ok(ticket.signedUrl.startsWith('https://storage.example/'))
  const reference = await f.lib.resolveUploadedResume(ticket.receipt, job, applicant)
  assert.match(reference, /^supabase:\/\/[^/]+\/company\/job\/.+\.pdf$/)
})
test('upload receipts reject tampering, different job, different tenant and different email', async () => {
  const f = storageFixture()
  const { receipt } = await f.lib.issueResumeUpload(job, applicant, file)
  for (const [token, target, email] of [
    [receipt + 'bad', job, applicant],
    [receipt, { ...job, id: 'other-job' }, applicant],
    [receipt, { ...job, companyId: 'other-company' }, applicant],
    [receipt, job, 'other@example.com'],
  ]) assert.throws(() => f.lib.verifyResumeTicket(token, target, email), /expired or is invalid/)
})
test('upload verification rejects mismatched storage metadata and expired receipts', async () => {
  const f = storageFixture()
  const { receipt } = await f.lib.issueResumeUpload(job, applicant, file)
  f.object.size = MAX_RESUME_BYTES + 1
  await assert.rejects(f.lib.resolveUploadedResume(receipt, job, applicant), /does not match/)
  const original = Date.now
  try {
    Date.now = () => original() + 3 * 60 * 60 * 1000
    assert.throws(() => f.lib.verifyResumeTicket(receipt, job, applicant), /expired/)
  } finally { Date.now = original }
})
test('bucket is created private with 10 MB limit; existing public bucket is refused', async () => {
  const f = storageFixture()
  f.storage.getBucket = async () => ({ error: new Error('Missing') })
  await f.lib.issueResumeUpload(job, applicant, file)
  assert.equal(f.bucketOptions().public, false)
  assert.equal(f.bucketOptions().fileSizeLimit, MAX_RESUME_BYTES)
  f.storage.getBucket = async () => ({ data: { public: true }, error: null })
  await assert.rejects(f.lib.issueResumeUpload(job, applicant, file), /must be private/)
})

function applicationFixture() {
  let saved
  const db = { jobApplication: {
    findFirst: async () => null,
    create: async ({ data }) => { saved = data; return { id: 'application' } },
  } }
  const overrides = {
    '@/lib/prisma': { prisma: db },
    '@/lib/public-job-application': { acceptingJob: async () => ({ job }) },
    '@/lib/recruitment-runtime': { recruitmentModelsReady: () => true },
    '@/lib/recruitment-pipeline': { pipelineStageForCategory: async () => null },
    '@/lib/recruitment-resume-storage': { resolveUploadedResume: async () => 'supabase://recruitment-resumes/company/job/file.pdf' },
  }
  const route = loader(overrides)('src/app/api/public/jobs/[publicToken]/apply/route.ts')
  const form = new FormData()
  for (const [key, value] of Object.entries({ firstName: ' Test ', lastName: 'Applicant', email: ' TEST@example.com ', phone: '+639000000000', expectedSalary: '25000', resumeReceipt: 'receipt' })) form.set(key, value)
  return { route, form, db, overrides, saved: () => saved,
    submit: () => route.POST({ formData: async () => form }, { params: Promise.resolve({ publicToken: 'job-token' }) }) }
}
test('application saves private storage reference with normalized details and no filesystem writes', async () => {
  const f = applicationFixture()
  assert.equal((await f.submit()).status, 201)
  assert.equal(f.saved().resumeUrl, 'supabase://recruitment-resumes/company/job/file.pdf')
  assert.equal(f.saved().email, applicant)
  assert.equal(f.saved().firstName, 'Test')
  assert.equal(f.saved().expectedSalary, 25000)
})
test('application without optional résumé succeeds; old multipart uploads request a refresh', async () => {
  const f = applicationFixture()
  f.form.delete('resumeReceipt')
  assert.equal((await f.submit()).status, 201)
  assert.equal(f.saved().resumeUrl, null)
  f.form.set('resumeFile', new File(['%PDF'], 'resume.pdf', { type: file.type }))
  const result = await f.submit()
  assert.equal(result.status, 400)
  assert.match((await result.json()).error, /refresh/)
})
test('database failure is JSON; duplicate and invalid salary do not create applications', async () => {
  const f = applicationFixture()
  f.db.jobApplication.create = async () => { throw new Error('Simulated database outage') }
  assert.equal((await f.submit()).status, 500)
  f.db.jobApplication.findFirst = async () => ({ id: 'existing' })
  assert.equal((await f.submit()).status, 409)
  f.form.set('expectedSalary', 'not-a-number')
  const result = await f.submit()
  assert.equal(result.status, 400)
  assert.equal(typeof (await result.json()).error, 'string')
  assert.equal(f.saved(), undefined)
})
test('closed jobs cannot issue upload URLs', async () => {
  let issued = false
  const { POST } = loader({
    '@/lib/public-job-application': { acceptingJob: async () => ({ error: 'Closed', status: 409 }) },
    '@/lib/recruitment-resume-storage': { issueResumeUpload: async () => { issued = true } },
  })('src/app/api/public/jobs/[publicToken]/resume-upload/route.ts')
  const result = await POST({ json: async () => ({ ...file, email: applicant }) }, { params: Promise.resolve({ publicToken: 'closed-job' }) })
  assert.equal(result.status, 409)
  assert.equal(issued, false)
})
test('HR résumé access redirects to a short-lived URL only after tenant-scoped lookup', async () => {
  let found = true
  const { GET } = loader({
    '@/lib/api-auth': { requireAuth: async () => ({ ctx: { companyId: 'company' } }) },
    '@/lib/hris-pro': { requireHrisProApi: async () => null },
    '@/lib/recruitment-runtime': { recruitmentModelsReady: () => true },
    '@/lib/prisma': { prisma: { jobApplication: { findFirst: async ({ where }) => { assert.equal(where.companyId, 'company'); return found ? { resumeUrl: 'supabase://recruitment-resumes/company/job/file.pdf' } : null } } } },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ storage: { from: () => ({ createSignedUrl: async (_path, ttl) => { assert.equal(ttl, 300); return { data: { signedUrl: 'https://storage.example/private.pdf?token=short-lived' } } } }) } }) },
  })('src/app/api/recruitment/applications/[applicationId]/resume/route.ts')
  const params = { params: Promise.resolve({ applicationId: 'application' }) }
  const response = await GET({}, params)
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  found = false
  assert.equal((await GET({}, params)).status, 404)
})
