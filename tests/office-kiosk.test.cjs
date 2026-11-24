const { test } = require('node:test'); const assert = require('node:assert/strict');
const fs=require('fs'),path=require('path'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
function loader(overrides={}) { overrides={'@/lib/hris-pro':{getHrisProAccess:async id=>({entitled:id===betaCompany || id==='pro-company' || id==='trial-company'})},...overrides}; const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(n=>Object.hasOwn(overrides,n)?overrides[n]:n.startsWith('@/')?load('src/'+n.slice(2)+'.ts'):n.startsWith('.')?load(path.resolve(path.dirname(file),n+'.ts')):require(n),m,m.exports);return m.exports;}return load;}
const betaCompany='cmnbg5ase0002sx0z3wn9owin';
const model='face-api.js@0.22.2/face_recognition_model';
const ref=Array.from({length:128},(_,i)=>i===0?1:0), other=Array.from({length:128},(_,i)=>i===1?1:0);
const policy=loader({'@/lib/prisma':{prisma:{}}})('src/lib/office-kiosk.ts');
const id='00000000-0000-4000-8000-000000000001';
const scan={challengeId:id,model,embeddings:[ref,ref,ref],photo:'data:image/jpeg;base64,/9j/'};
const request=(body,path='clock')=>new NextRequest('https://onclockph.com/api/office-kiosk/'+path,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://onclockph.com'},body:JSON.stringify(body)});
test('matching rejects malformed, zero, mismatched and mixed-identity frames',()=>{assert.equal(policy.kioskFaceMatches(ref,[ref,ref,ref]),true);for(const frames of [[ref,ref,other],[other,other,other],[[1],[1],[1]],[Array(128).fill(0),ref,ref]])assert.equal(policy.kioskFaceMatches(ref,frames),false);assert.equal(policy.kioskFaceMatches(null,[ref,ref,ref]),false);assert.equal(policy.kioskScanSchema.safeParse({...scan,model:'other'}).success,false);assert.equal(policy.kioskScanSchema.safeParse({...scan,embeddings:[ref]}).success,false)});
test('device credentials are hashed and cross-origin writes rejected',()=>{const secret=policy.kioskSecret();assert.equal(secret.length,43);assert.notEqual(policy.hashKioskSecret(secret),secret);assert.equal(policy.sameOrigin(new NextRequest('https://onclockph.com/api/office-kiosk/clock',{headers:{origin:'https://evil.test'}})),false)});
test('disabled face recognition and unpaired devices cannot authenticate',async()=>{let enabled=false;const auth=loader({'@/lib/prisma':{prisma:{officeKiosk:{findUnique:async({where})=>{assert.equal(where.tokenHash,policy.hashKioskSecret('test'));return {companyId:betaCompany,company:{faceRecognitionRequired:enabled}}}}}}})('src/lib/office-kiosk.ts');const req=new NextRequest('https://onclockph.com/api/office-kiosk/status',{headers:{cookie:policy.KIOSK_COOKIE+'=test'}});assert.equal(await auth.kioskAuth(req),null);enabled=true;assert.ok(await auth.kioskAuth(req));assert.equal(await auth.kioskAuth(new NextRequest(req.url)),null)});
test('pairing code is one-use and issues HttpOnly scoped cookie',async()=>{let used=false;const route=loader({'@/lib/prisma':{prisma:{officeKiosk:{findFirst:async()=>({id:'device',companyId:betaCompany}),updateMany:async({where,data})=>{assert.equal(where.companyId,betaCompany);assert.equal(where.company.faceRecognitionRequired,true);assert.ok(where.pairExpiresAt.gt instanceof Date);assert.equal(data.pairHash,null);if(used)return {count:0};used=true;return {count:1}}}}}})('src/app/api/office-kiosk/pair/route.ts');const first=await route.POST(request({code:'ABCDEF-123456-ABCDEF'},'pair'));assert.equal(first.status,200);assert.match(first.headers.get('set-cookie'),/HttpOnly/);assert.match(first.headers.get('set-cookie'),/SameSite=strict/i);assert.equal((await route.POST(request({code:'ABCDEF123456ABCDEF'},'pair'))).status,403)});
function clockHarness(opts={}) {
  let calls=0, locked=false;
  const attempt={id,kioskId:'device',employeeId:null,action:opts.action||'AUTO',state:'CHALLENGE',expiresAt:new Date(Date.now()+60000),...opts.attempt};
  const device={id:'device',companyId:'company',tokenHash:'hash',company:{faceRecognitionRequired:true}};
  const employee={id:'employee',userId:'user',faceEmbedding:ref,firstName:'Test',lastName:'Employee',...opts.employee};
  const db={
    officeKiosk:{
      updateMany:async()=>{if(opts.locked||locked)return {count:0};locked=true;return {count:1}},
      update:async()=>{locked=false;return {}}
    },
    officeKioskAttempt:{
      findFirst:async({where})=>{assert.equal(where.kioskId,'device');return where.id ? (opts.foreign?null:structuredClone(attempt)) : (opts.recent?{id:'recent'}:null)},
      updateMany:async({where,data})=>{if(where.state!==attempt.state)return {count:0};Object.assign(attempt,data);return {count:1}},
      update:async({data})=>Object.assign(attempt,data)
    },
    dTRRecord:{findFirst:async({where})=>{assert.equal(where.employeeId,'employee');return where.OR ? (opts.recentPunch?{id:'recent-punch'}:null) : (opts.open?{id:'open-shift',...opts.open}:null)}},
    employee:{findMany:async({where,take})=>{assert.equal(where.companyId,'company');assert.equal(where.isActive,true);assert.equal(where.faceEmbeddingModel,model);assert.ok(where.faceConsentAt.not===null);assert.ok(where.userId.not===null);assert.equal(take,5001);return opts.inactive?[]:opts.ambiguous?[employee,{...employee,id:'second'}]:[employee]}}
  };
  db.$transaction=async fn=>fn(db);
  const punch=async(req,ctx)=>{calls++;assert.equal(ctx.role,'EMPLOYEE');assert.equal(ctx.userId,'user');assert.equal(ctx.companyId,'company');assert.equal((await req.json()).employeeId,undefined);if(opts.throw)throw Error('unknown');return NextResponse.json(opts.denied?{error:'Outside office radius'}:{record:{id:'dtr'}},{status:opts.denied?403:200})};
  const route=loader({'@/lib/prisma':{prisma:db},'@/lib/office-kiosk':{...policy,kioskAuth:async()=>opts.unauthorized?null:device},'@/lib/attendance/activities':{normalizeActivityPhoto:async p=>p},'@/lib/attendance/kiosk-action':{...loader({'@/lib/prisma':{prisma:{}}})('src/lib/attendance/kiosk-action.ts'),resolveKioskShift:async()=>({breakMinutes:opts.breakMinutes??0,end:opts.end??null})},'@/lib/attendance/break':{performBreak:punch},'@/lib/attendance/clock-in':{performClockIn:punch},'@/lib/attendance/clock-out':{performClockOut:punch}})('src/app/api/office-kiosk/clock/route.ts');
  return {route,attempt,calls:()=>calls};
}
test('one face scan performs one punch; retry returns saved success',async()=>{const h=clockHarness();assert.equal((await h.route.POST(request(scan))).status,200);assert.equal((await h.route.POST(request(scan))).status,200);assert.equal(h.calls(),1);assert.equal(h.attempt.state,'SUCCEEDED');assert.equal(h.attempt.result.action,'IN')});
test('explicit clock out uses the same guarded flow',async()=>{const h=clockHarness({action:'OUT'});assert.equal((await h.route.POST(request(scan))).status,200);assert.equal(h.attempt.result.action,'OUT')});
test('foreign, expired, revoked and already-processing scans cannot punch',async()=>{for(const opts of [{foreign:true},{attempt:{expiresAt:new Date(0)}},{unauthorized:true},{attempt:{state:'PROCESSING'}},{locked:true},{inactive:true}]){const h=clockHarness(opts);assert.notEqual((await h.route.POST(request(scan))).status,200);assert.equal(h.calls(),0)}});
test('failed face match never reaches attendance service',async()=>{const h=clockHarness();assert.equal((await h.route.POST(request({...scan,embeddings:[other,other,other]}))).status,403);assert.equal(h.calls(),0);assert.equal(h.attempt.state,'REJECTED')});
test('schedule/geofence policy rejection stays rejected',async()=>{const h=clockHarness({denied:true});const r=await h.route.POST(request(scan));assert.equal(r.status,403);assert.equal((await r.json()).error,'Outside office radius');assert.equal(h.attempt.state,'REJECTED')});
test('uncertain result is not automatically re-submitted',async()=>{const h=clockHarness({throw:true});assert.equal((await h.route.POST(request(scan))).status,503);assert.equal(h.attempt.state,'REVIEW');assert.equal((await h.route.POST(request(scan))).status,409);assert.equal(h.calls(),1)});
test('download is gated by saved face setting and settings permission',async()=>{for(const [allowed,enabled,expected] of [[false,true,403],[true,false,403],[true,true,307]]){const route=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:betaCompany},error:null})},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>allowed},'@/lib/prisma':{prisma:{company:{findUnique:async()=>({faceRecognitionRequired:enabled})}}}})('src/app/api/office-kiosk/download/route.ts');assert.equal((await route.GET(new NextRequest('https://onclockph.com/api/office-kiosk/download'))).status,expected)}});

test('automatic identification selects one clear employee and rejects ambiguous or mixed samples',()=>{
 const a={id:'a',faceEmbedding:ref},b={id:'b',faceEmbedding:other};
 assert.equal(policy.identifyKioskEmployee([a,b],[ref,ref,ref]).id,'a');
 assert.equal(policy.identifyKioskEmployee([a,b],[other,other,other]).id,'b');
 assert.equal(policy.identifyKioskEmployee([a,{...a,id:'duplicate'}],[ref,ref,ref]),null);
 assert.equal(policy.identifyKioskEmployee([a,b],[ref,other,ref]),null);
 assert.equal(policy.identifyKioskEmployee([],[ref,ref,ref]),null);
 assert.equal(policy.identifyKioskEmployee([{faceEmbedding:null}],[ref,ref,ref]),null);
});
test('automatic action clocks out an open shift and clocks in without one',async()=>{
 for(const open of [true,false]){const h=clockHarness({open});assert.equal((await h.route.POST(request(scan))).status,200);assert.equal(h.attempt.action,open?'OUT':'IN');assert.equal(h.attempt.employeeId,'employee');}
});
test('recent kiosk or app punches cannot toggle attendance immediately',async()=>{
 for(const opts of [{recent:true},{recentPunch:true},{ambiguous:true}]){const h=clockHarness(opts);assert.notEqual((await h.route.POST(request(scan))).status,200);assert.equal(h.calls(),0);}
});
test('simultaneous submission consumes the challenge only once',async()=>{
 const h=clockHarness();await Promise.all([h.route.POST(request(scan)),h.route.POST(request(scan))]);assert.equal(h.calls(),1);
});
test('scanner never rearms while a face remains or multiple people are present',()=>{
 const {FaceScanRearm}=loader()('src/lib/face/scan-cycle.ts');const cycle=new FaceScanRearm();cycle.finish(0);
 assert.equal(cycle.observe(1,60000),false);assert.equal(cycle.observe(2,61000),false);
 assert.equal(cycle.observe(0,62000),false);assert.equal(cycle.observe(1,63000),false);
 assert.equal(cycle.observe(0,64000),false);assert.equal(cycle.observe(0,65999),false);assert.equal(cycle.observe(0,66000),true);
 assert.equal(cycle.observe(0,70000),false);
 cycle.finish(100000);assert.equal(cycle.observe(0,100000),false);assert.equal(cycle.observe(0,102000),false);assert.equal(cycle.observe(0,106000),true);
});
test('new scan challenge requires no employee number and binds no client employee identity',async()=>{
 const db={officeKiosk:{updateMany:async()=>({count:1})},officeKioskAttempt:{create:async({data})=>{assert.equal(data.action,'AUTO');assert.equal(data.employeeId,undefined);return {id,expiresAt:data.expiresAt}}}};
 const route=loader({'@/lib/prisma':{prisma:db},'@/lib/office-kiosk':{...policy,kioskAuth:async()=>({id:'device',companyId:'company'})}})('src/app/api/office-kiosk/challenge/route.ts');
 assert.equal((await route.POST(request({employeeId:'forged'},'challenge'))).status,200);
});
test('verified kiosk target stays bound to matched profile and company/user',async()=>{
 let available=true;
 const {resolvePunchEmployeeId}=loader({'@/lib/prisma':{prisma:{employee:{findFirst:async({where})=>{assert.deepEqual(where,{id:'matched',companyId:'company',userId:'user',isActive:true});return available?{id:'matched'}:null}}}},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>false},'@/lib/portal-employee':{resolvePortalEmployeeId:async()=>{throw Error('Must not choose another profile')}}})('src/lib/attendance/punch-target.ts');
 const ctx={companyId:'company',userId:'user',role:'EMPLOYEE',email:''};
 assert.equal((await resolvePunchEmployeeId(ctx,undefined,'matched')).employeeId,'matched');
 available=false;assert.ok((await resolvePunchEmployeeId(ctx,undefined,'matched')).forbidden);
});

const actions=loader({'@/lib/prisma':{prisma:{}}})('src/lib/attendance/kiosk-action.ts');
test('automatic break cycle and shift end override',async()=>{
 const now=new Date('2026-10-21T04:00:00Z'), open={date:new Date('2026-10-21'),timeIn:new Date('2026-10-21T00:00:00Z'),breakIn:null,breakOut:null};
 assert.equal(actions.kioskNextAction(null,60,null,now),'IN');
 assert.equal(actions.kioskNextAction(open,60,null,now),'BREAK_START');
 assert.equal(actions.kioskNextAction({...open,breakIn:now},60,null,now),'BREAK_END');
 assert.equal(actions.kioskNextAction({...open,breakIn:now,breakOut:now},60,null,now),'OUT');
 assert.equal(actions.kioskNextAction(open,0,null,now),'OUT');
 assert.equal(actions.kioskNextAction(open,60,now,now),'OUT');
 assert.equal(actions.kioskNextAction({...open,breakIn:now},60,now,now),'OUT');
 assert.equal(actions.shiftEnd(open.date,'22:00','06:00').toISOString(),'2026-10-21T22:00:00.000Z');
 assert.equal(actions.shiftEnd(open.date,'08:00','17:00').toISOString(),'2026-10-21T09:00:00.000Z');
 for(const [record,expected] of [[open,'BREAK_START'],[{...open,breakIn:now},'BREAK_END'],[{...open,breakIn:now,breakOut:now},'OUT']]){
 const h=clockHarness({open:record,breakMinutes:60});assert.equal((await h.route.POST(request(scan))).status,200);assert.equal(h.attempt.result.action,expected);assert.equal(h.calls(),1);
 }
});

test('break service enforces identity, location, state and concurrent changes',async()=>{
 for(const mode of ['start','end','completed','race','outside','wrong-profile']){
 let writes=0;
 const now=new Date(), record={id:'dtr',employeeId:'employee',date:new Date('2026-10-21'),timeIn:new Date(now-3600000),timeOut:null,breakIn:mode==='end'||mode==='completed'?new Date(now-1800000):null,breakOut:mode==='completed'?now:null};
 const service=loader({
 '@/lib/prisma':{prisma:{dTRRecord:{findFirst:async()=>record,updateMany:async({where,data})=>{writes++;assert.equal(where.timeOut,null);assert.equal(where.breakIn,record.breakIn);assert.equal(where.breakOut,record.breakOut);assert.ok(data.breakIn||data.breakOut);return {count:mode==='race'?0:1}}}}},
 '@/lib/attendance/punch-target':{resolvePunchEmployeeId:async(ctx,requested,verified)=>{assert.equal(verified,'employee');return mode==='wrong-profile'?{employeeId:null,forbidden:'Inactive'}:{employeeId:'employee'}}},
 '@/lib/attendance/kiosk-action':{resolveKioskShift:async()=>({breakMinutes:60})},
 '@/lib/attendance/schedule-location':{resolveAttendanceLocation:async()=>({policy:{}}),savedGeofence:()=>null},
 '@/lib/attendance/location-policy':{locationError:()=>mode==='outside'?'Outside office':null}
 })('src/lib/attendance/break.ts');
 const response=await service.performBreak(request({lat:14,lng:121}),{companyId:'company',userId:'user',role:'EMPLOYEE',email:''},mode==='end'?'BREAK_END':'BREAK_START','employee');
 assert.equal(response.status,['start','end'].includes(mode)?200:['race','completed'].includes(mode)?409:403);
 assert.equal(writes,['start','end','race'].includes(mode)?1:0);
 }
});
test('break schedule uses the original overnight date and closest assigned shift',async()=>{
 const date=new Date('2026-10-20');
 const resolver=loader({'@/lib/prisma':{prisma:{employee:{findFirstOrThrow:async()=>({workSchedule:{timeIn:'08:00',timeOut:'17:00',breakEnabled:true,breakMinutes:60}})},employeeShiftAssignment:{findMany:async({where})=>{assert.equal(where.companyId,'company');assert.equal(where.date,date);return [{timeIn:'08:00',timeOut:'17:00',schedule:{timeIn:'08:00',timeOut:'17:00',breakEnabled:true,breakMinutes:60}},{timeIn:'22:00',timeOut:'06:00',schedule:{timeIn:'22:00',timeOut:'06:00',breakEnabled:false,breakMinutes:60}}]}}}}})('src/lib/attendance/kiosk-action.ts');
 const result=await resolver.resolveKioskShift('company','employee',{date,timeIn:new Date('2026-10-20T14:00:00Z'),breakIn:null,breakOut:null});
 assert.equal(result.breakMinutes,0);assert.equal(result.end.toISOString(),'2026-10-20T22:00:00.000Z');
});

test('unrecognized face has a distinct flag and records no attendance',async()=>{
 const h=clockHarness({inactive:true});const response=await h.route.POST(request(scan));
 assert.equal(response.status,403);assert.equal((await response.json()).code,'FACE_NOT_RECOGNIZED');assert.equal(h.calls(),0);
});
test('paired kiosk status returns only display branding',async()=>{
 const route=loader({'@/lib/prisma':{prisma:{officeKiosk:{update:async()=>({})}}},'@/lib/office-kiosk':{...policy,kioskAuth:async()=>({id:'device',name:'Office',company:{name:'Demo',logoUrl:'https://example.com/logo.png'}})}})('src/app/api/office-kiosk/status/route.ts');
 const response=await route.GET(new NextRequest('https://onclockph.com/api/office-kiosk/status'));
 assert.deepEqual(await response.json(),{company:'Demo',logoUrl:'https://example.com/logo.png',name:'Office'});
});

test('face access follows subscription entitlement for any company',async()=>{
 const {faceBetaAvailable}=loader({'@/lib/hris-pro':{getHrisProAccess:async id=>({entitled:['pro-company','trial-company'].includes(id)})}})('src/lib/face/availability.ts');
 for(const id of ['pro-company','trial-company']) assert.equal(await faceBetaAvailable(id),true);
 for(const id of [betaCompany,'base-company','',null,undefined]) assert.equal(await faceBetaAvailable(id),false);
});
test('non-Pro device credentials cannot authorize the kiosk',async()=>{
 const auth=loader({'@/lib/prisma':{prisma:{officeKiosk:{findUnique:async()=>({companyId:'other',company:{faceRecognitionRequired:true,name:'Demo Inc'}})}}}})('src/lib/office-kiosk.ts');
 assert.equal(await auth.kioskAuth(new NextRequest('https://onclockph.com/api/office-kiosk/status',{headers:{cookie:policy.KIOSK_COOKIE+'=test'}})),null);
});
test('non-Pro face setup, verify, download and status are gated before data access',async()=>{
 for(const path of ['face/setup','face/verify','office-kiosk/download','face/status']){
 const route=loader({'@/lib/api-auth':{requireAuth:async()=>({ctx:{companyId:'other'},error:null})},'@/lib/prisma':{prisma:{}},'@/lib/auth/effective-permissions':{ctxHasPermission:async()=>true}})('src/app/api/'+path+'/route.ts');
 const response=await (route.GET||route.POST)(request({}));
 if(path==='face/status'){assert.equal(response.status,200);assert.equal((await response.json()).available,false)}else assert.equal(response.status,403);
 }
});

test('blink challenge adapts to eye shape but never accepts a static face',()=>{
 const {BlinkChallenge}=loader()('src/lib/face/blink-challenge.ts');
 for(const opening of [0.17,0.23,0.32]){
 const blink=new BlinkChallenge();for(let t=0;t<2000;t+=125)blink.observe(opening,t);assert.equal(blink.done,false);
 assert.equal(blink.observe(opening*0.5,2100),'reopen');assert.equal(blink.observe(opening,2400),'done');assert.equal(blink.done,true);
 blink.reset();assert.equal(blink.done,false);
 }
 const blink=new BlinkChallenge();[0,125,250].forEach(t=>blink.observe(0.25,t));blink.observe(0.1,500);assert.equal(blink.observe(0.25,6000),'open');assert.equal(blink.done,false);
 for(let t=0;t<1000;t+=125)blink.observe(NaN,t);assert.equal(blink.done,false);
});

test('guided blink tolerates slow camera inference and rejects a noisy calibration outlier',()=>{
 const {BlinkChallenge}=loader()('src/lib/face/blink-challenge.ts');
 const blink=new BlinkChallenge();assert.equal(blink.observe(.20,0),'open');assert.equal(blink.observe(.65,500),'open');assert.equal(blink.observe(.21,1000),'close');
 assert.equal(blink.observe(.10,2000),'reopen');assert.equal(blink.observe(.20,5000),'done');
 const steady=new BlinkChallenge();[.2,.21,.22].forEach((v,i)=>steady.observe(v,i*500));
 for(let i=0;i<20;i++)steady.observe(.20+i%2*.01,2000+i*500);
 assert.equal(steady.done,false);
});

test('Pro company outside the former pilot can authorize and pair; Base cannot pair',async()=>{
 for(const [companyId,allowed] of [['pro-company',true],['other',false]]){
  let writes=0;
  const db={officeKiosk:{findUnique:async()=>({companyId,company:{faceRecognitionRequired:true}}),findFirst:async()=>({id:'device',companyId}),updateMany:async({where})=>{assert.equal(where.companyId,companyId);writes++;return {count:1}}}};
  const load=loader({'@/lib/prisma':{prisma:db}});
  const auth=load('src/lib/office-kiosk.ts');
  assert.equal(!!await auth.kioskAuth(new NextRequest('https://onclockph.com/api/office-kiosk/status',{headers:{cookie:policy.KIOSK_COOKIE+'=test'}})),allowed);
  const response=await load('src/app/api/office-kiosk/pair/route.ts').POST(request({code:'ABCDEF123456ABCDEF'},'pair'));
  assert.equal(response.status,allowed?200:403);assert.equal(writes,allowed?1:0);
 }
});
