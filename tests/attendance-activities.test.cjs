const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
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
const base = { userId: 'user', companyId: 'company', role: 'EMPLOYEE' }
const policies = loader({ '@/lib/prisma': { prisma: {} }, '@/lib/auth/effective-permissions': { ctxHasPermission: async () => true } })('src/lib/attendance/activities.ts')
test('employees can only read their own company activity records', async () => {
  assert.deepEqual(await policies.activityScope(base), { companyId: 'company', userId: 'user' })
  await assert.rejects(policies.activityScope(base, true))
})
test('administrators remain company scoped and department heads stay department scoped', async () => {
  assert.deepEqual(await policies.activityScope({ ...base, role: 'COMPANY_ADMIN' }, true), { companyId: 'company' })
  assert.deepEqual(await policies.activityScope({ ...base, role: 'DEPARTMENT_HEAD', managedDepartmentId: 'department' }, true), { companyId: 'company', departmentId: 'department' })
  await assert.rejects(policies.activityScope({ ...base, role: 'DEPARTMENT_HEAD' }, true))
})
test('custom permissions are required for reports', async () => {
  const denied = loader({ '@/lib/prisma': { prisma: {} }, '@/lib/auth/effective-permissions': { ctxHasPermission: async () => false } })('src/lib/attendance/activities.ts')
  await assert.rejects(denied.activityScope({ ...base, role: 'HR_MANAGER' }, true))
})
test('month boundaries use shift dates, including leap years and year rollover', () => {
  assert.equal(policies.monthRange('2024-02').lt.toISOString(), '2024-03-01T00:00:00.000Z')
  assert.equal(policies.monthRange('2026-12').lt.toISOString(), '2027-01-01T00:00:00.000Z')
  for (const value of ['2026-13', '2026-00', '', '2026-02-30']) assert.throws(() => policies.monthRange(value))
})
test('image content cannot masquerade as JPEG or contain SVG/HTML', () => {
  for (const image of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,PGh0bWw+', 'https://example.com/photo.jpg']) assert.throws(() => policies.decodeActivityPhoto(image))
})
test('server photo normalization decodes, resizes and strips metadata', async () => {
  const sharp = require('sharp')
  const original = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'red' } }).png().toBuffer()
  const normalized = await policies.normalizeActivityPhoto('data:image/png;base64,' + original.toString('base64'))
  const { bytes, mime } = policies.decodeActivityPhoto(normalized), metadata = await sharp(bytes).metadata()
  assert.equal(mime, 'image/jpeg'); assert.equal(metadata.width, 1280); assert.equal(metadata.height, 640)
  assert.equal(metadata.exif, undefined)
})
function postHarness({ closed = false, foreign = false, inactive = false } = {}) {
  const rows = new Map(), writes = []
  const tx = {
    $queryRaw: async (parts, id, employeeId) => { assert.equal(employeeId, 'employee'); assert.ok(parts.join('?').includes('FOR UPDATE')); return foreign ? [] : [{ id, timeIn: new Date(), timeOut: closed ? new Date() : null }] },
    attendanceActivity: { findUnique: async ({ where }) => rows.get(where.id) ?? null, create: async ({ data }) => { writes.push(data); const row = { ...data, loggedAt: new Date('2026-10-21T03:00:00Z') }; rows.set(data.id, row); return row } },
  }
  const prisma = { employee: { findFirst: async query => { assert.equal(query.where.companyId, 'company'); assert.equal(query.where.userId, 'user'); return inactive ? null : { id: 'employee' } } }, $transaction: async fn => fn(tx) }
  const api = loader({ '@/lib/api-auth': { requireAuth: async () => ({ ctx: base, error: null }) }, '@/lib/prisma': { prisma }, '@/lib/auth/effective-permissions': { ctxHasPermission: async () => false } })('src/app/api/attendance/activities/route.ts')
  const body = { id: '12345678-1234-4123-8123-123456789012', dtrRecordId: 'shift', description: 'Site visit', loggedAt: '2000-01-01T00:00:00Z', employeeId: 'other' }
  const send = (changes = {}) => api.POST(new NextRequest('http://localhost/api/attendance/activities', { method: 'POST', body: JSON.stringify({ ...body, ...changes }), headers: { 'Content-Type': 'application/json' } }))
  return { send, writes }
}
test('activities use server time and authenticated employee, never client timestamp or employee id', async () => {
  const h = postHarness(); assert.equal((await h.send()).status, 201)
  assert.equal(h.writes[0].loggedAt, undefined); assert.equal(h.writes[0].employeeId, undefined)
})
test('same request retry saves one activity', async () => {
  const h = postHarness(); await h.send(); assert.equal((await h.send()).status, 201); assert.equal(h.writes.length, 1)
  assert.equal((await h.send({ description: 'Different activity' })).status, 400)
})
for (const [label, options] of [['closed shift', { closed: true }], ['another employee shift', { foreign: true }], ['inactive employee', { inactive: true }]]) test(label + ' cannot add activities', async () => {
  const h = postHarness(options); assert.notEqual((await h.send()).status, 201); assert.equal(h.writes.length, 0)
})
test('empty descriptions and excessive content cannot create activity', async () => {
  const h = postHarness(); assert.equal((await h.send({ description: '  ' })).status, 400); assert.equal((await h.send({ description: 'x'.repeat(2001) })).status, 400); assert.equal(h.writes.length, 0)
})
test('photo endpoint applies employee ownership and never returns another tenant photo', async () => {
  const api = loader({ '@/lib/api-auth': { requireAuth: async () => ({ ctx: base, error: null }) }, '@/lib/prisma': { prisma: { attendanceActivity: { findFirst: async ({ where }) => { assert.deepEqual(where.dtrRecord.employee, { companyId: 'company', userId: 'user' }); return null } } } }, '@/lib/auth/effective-permissions': { ctxHasPermission: async () => false } })('src/app/api/attendance/activities/[id]/photo/route.ts')
  const response = await api.GET(new NextRequest('http://localhost/api/attendance/activities/id/photo'), { params: Promise.resolve({ id: 'foreign' }) })
  assert.equal(response.status, 404)
})
test('report endpoint denies employee access before querying attendance', async () => {
  const api = loader({ '@/lib/api-auth': { requireAuth: async () => ({ ctx: base, error: null }) }, '@/lib/prisma': { prisma: {} }, '@/lib/auth/effective-permissions': { ctxHasPermission: async () => false } })('src/app/api/attendance/reports/route.ts')
  assert.equal((await api.GET(new NextRequest('http://localhost/api/attendance/reports?month=2026-10'))).status, 403)
})
const report = loader()('src/lib/attendance/report-data.ts')
test('summary counts multi-shift presence once, sums hours, and does not invent absences', () => {
  const row = { date: '2026-10-20', timeIn: '2026-10-20T12:00:00Z', isAbsent: false, isLeave: false, regularHours: 3, overtimeHours: 1, lateMinutes: 5, undertimeMinutes: 0, activities: [{}] }
  const s = report.summarize([row, row]); assert.equal(s.present, 1); assert.equal(s.regular, 6); assert.equal(s.absent, 0); assert.equal(s.activities, 2)
  assert.equal(report.summarize([]).absent, 0)
})
test('CSV escapes quotes, multiline descriptions and spreadsheet formulas', () => {
  assert.equal(report.csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"')
  assert.equal(report.csvCell('hello\nworld'), '"hello\nworld"')
})

test('company upload policy rejects device and unclassified photos but preserves camera and text logs', async () => {
  for (const [enabled, source, photo, expected] of [[false,'upload',true,403],[false,undefined,true,403],[false,'camera',true,201],[false,undefined,false,201],[true,'upload',true,201]]) {
    let saved = 0;
    const db = {
      company: { findUnique: async ({where}) => { assert.equal(where.id, base.companyId); return {activityPhotoUploadEnabled:enabled} } },
      employee: { findFirst: async () => ({id:'employee'}) },
      $transaction: async fn => fn({$queryRaw: async () => [{id:'shift',timeIn:new Date(),timeOut:null}],attendanceActivity:{findUnique:async()=>null,create:async({data})=>{saved++;return data}}})
    };
    const route = loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:base,error:null})},'@/lib/prisma':{prisma:db},'@/lib/attendance/activities':{...policies,normalizeActivityPhoto:async value=>value}})('src/app/api/attendance/activities/route.ts');
    const response=await route.POST(new NextRequest('https://onclockph.com/api/attendance/activities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'00000000-0000-4000-8000-000000000001',dtrRecordId:'shift',description:'Work completed',...(photo?{photo:'test-photo',photoSource:source}:{})})}));
    assert.equal(response.status,expected);assert.equal(saved,expected===201?1:0);
  }
});

test('single-day reports validate dates and include exactly one Philippine calendar day', () => {
  const range=policies.reportDayRange('2026-10-23',true);
  assert.equal(range.gte.toISOString(),'2026-10-22T16:00:00.000Z');
  assert.equal(range.lt.toISOString(),'2026-10-23T16:00:00.000Z');
  assert.throws(()=>policies.reportDayRange('2026-02-30'));
  assert.throws(()=>policies.reportDayRange('2026-13-01'));
});
test('daily activity reports filter log timestamps rather than excluding overnight shifts', async () => {
  let activityFilter;
  const route=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{...base,role:'COMPANY_ADMIN'},error:null})},'@/lib/attendance/activities':{...policies,activityScope:async()=>({companyId:'company'}),listActivities:async where=>{activityFilter=where;return []}},'@/lib/prisma':{prisma:{employee:{findMany:async()=>[]},company:{findUnique:async()=>({name:'Company'})},attendanceActivity:{count:async()=>0},dTRRecord:{count:async()=>0,findMany:async({where})=>{assert.equal(where.date,undefined);assert.ok(where.activities.some.loggedAt);return []}}}}})('src/app/api/attendance/reports/route.ts');
  const response=await route.GET(new NextRequest('https://onclockph.com/api/attendance/reports?type=activities&date=2026-10-23'));
  assert.equal(response.status,200);assert.equal((await response.json()).reportDate,'2026-10-23');
  assert.equal(activityFilter.loggedAt.gte.toISOString(),'2026-10-22T16:00:00.000Z');
  assert.deepEqual(activityFilter.dtrRecord.employee.AND,[{companyId:'company'}]);
});
test('activity location is validated and saved with the employee shift', async () => {
  for(const latitude of [14.6,91]){
    let saved;
    const route=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:base,error:null})},'@/lib/attendance/activities':policies,'@/lib/prisma':{prisma:{employee:{findFirst:async()=>({id:'employee'})},$transaction:async fn=>fn({$queryRaw:async()=>[{id:'shift',timeIn:new Date(),timeOut:null}],attendanceActivity:{findUnique:async()=>null,create:async({data})=>{saved=data;return data}}})}}})('src/app/api/attendance/activities/route.ts');
    const response=await route.POST(new NextRequest('https://onclockph.com/api/attendance/activities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'00000000-0000-4000-8000-000000000001',dtrRecordId:'shift',description:'Visit',location:{latitude,longitude:121,locationAccuracy:12,locationCapturedAt:'2026-10-21T07:00:00.000Z'}})}));
    assert.equal(response.status,latitude===91?400:201);
    if(latitude!==91){assert.equal(saved.latitude,14.6);assert.equal(saved.longitude,121);assert.ok(saved.locationCapturedAt instanceof Date)}else assert.equal(saved,undefined);
  }
});

test('activity numbering uses full Philippine days across pagination and shifts', async () => {
 const selected=[{id:'a51',loggedAt:new Date('2026-10-21T15:00:00Z'),dtrRecord:{employeeId:'employee'}},{id:'b1',loggedAt:new Date('2026-10-21T16:00:00Z'),dtrRecord:{employeeId:'employee'}}];
 const api=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:base,error:null})},'@/lib/attendance/activities':{...policies,activityScope:async()=>({companyId:'company',userId:'user'}),listActivities:async()=>selected},'@/lib/prisma':{prisma:{company:{findUnique:async()=>({})},employee:{findFirst:async()=>({id:'employee'})},dTRRecord:{findFirst:async()=>null},attendanceActivity:{count:async()=>52,findMany:async args=>{assert.deepEqual(args.orderBy,[{loggedAt:'asc'},{id:'asc'}]);if(args.skip!==undefined){assert.equal(args.skip,50);return selected}assert.equal(args.where.dtrRecord.employeeId,'employee');assert.equal(args.where.dtrRecord.employee.companyId,'company');return args.where.loggedAt.gte.toISOString()==='2026-10-20T16:00:00.000Z'?Array.from({length:51},(_,i)=>({id:'a'+(i+1)})):[{id:'b1'}]}}}}})('src/app/api/attendance/activities/route.ts');
 const response=await api.GET(new NextRequest('https://onclockph.com/api/attendance/activities?month=2026-10&page=2'));
 assert.equal(response.status,200);assert.deepEqual((await response.json()).activities.map(a=>a.dailyNumber),[51,1]);
});
