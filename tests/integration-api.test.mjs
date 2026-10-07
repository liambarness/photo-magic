import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const contract = loadTs('src/lib/integration-contract.ts');
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(12)]).toString('base64');
function body() { return {
  version: 1, requestId: 'fbe93716-02bd-46bb-9847-2976d34e7681',
  product: { reference: 'row-01', styleNumber: '00123', colorCode: 'BLK' },
  options: { presetId: 'preset' },
  images: [{ candidateId: 'c1', filename: 'original.png', sourceReference: 'vendor-url', contentType: 'image/png', dataBase64: png, viewType: 'front' }],
}; }
test('contract preserves exact identity and rejects mismatched bytes, duplicate candidates and unknown options', () => {
  assert.equal(contract.validateIntegrationRequest(body()).product.styleNumber, '00123');
  for (const change of [
    b => b.images.push({...b.images[0]}),
    b => b.images[0].contentType = 'image/jpeg',
    b => b.images[0].dataBase64 = 'bad',
    b => b.options.prompt = 'override',
    b => b.options.modelPoseType = 'invalid',
    b => b.images[0].sourceReference = null,
  ]) { const b = body(); change(b); assert.throws(() => contract.validateIntegrationRequest(b)); }
});
test('integration auth fails closed even if browser authentication is disabled', () => {
  const prior = process.env.PHOTO_MAGIC_API_SECRET;
  try {
    const { integrationAuth } = loadTs('src/lib/integration-auth.ts');
    delete process.env.PHOTO_MAGIC_API_SECRET;
    assert.equal(integrationAuth(new Request('http://local')).status, 503);
    process.env.PHOTO_MAGIC_API_SECRET = 'test-secret';
    assert.equal(integrationAuth(new Request('http://local', {headers:{authorization:'Bearer wrong'}})).status, 401);
    assert.equal(integrationAuth(new Request('http://local', {headers:{authorization:'Bearer test-secret'}})), null);
  } finally { if (prior === undefined) delete process.env.PHOTO_MAGIC_API_SECRET; else process.env.PHOTO_MAGIC_API_SECRET = prior; }
});
function api(existing = null) {
  let scheduled = 0; let created = 0;
  const route = loadTs('src/app/api/integration/v1/jobs/route.ts', {
    'next/server': { NextResponse: { json: (b, opts) => Response.json(b, opts) }, after: () => scheduled++ },
    '@/lib/integration-auth': { integrationAuth: () => null },
    '@/lib/integration-jobs': {
      readJob: async () => existing, createJob: async () => created++,
      resolvePrompts: async () => ({}), runJob: async () => {},
    },
  });
  return { run: (b) => route.POST(new Request('http://local', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(b)})),
    counts: () => ({scheduled,created}) };
}
test('submission schedules once and preserves request ID', async () => {
  const a = api(); const r = await a.run(body());
  assert.equal(r.status, 202); assert.equal((await r.json()).jobId, body().requestId);
  assert.deepEqual(a.counts(), {scheduled:1,created:1});
});
test('same request ID resumes status without generation; conflicting content is rejected', async () => {
  const { createHash } = await import('node:crypto');
  const b = body(); const existing = {jobId:b.requestId, requestHash:createHash('sha256').update(JSON.stringify(b)).digest('hex')};
  const a = api(existing); assert.equal((await a.run(b)).status,202);
  b.product.colorCode = 'RED'; assert.equal((await a.run(b)).status,409);
  assert.deepEqual(a.counts(), {scheduled:0,created:0});
});
test('status exposes authenticated routes and exact references; detects interrupted work', async () => {
  const job = {jobId:body().requestId, product:body().product, createdAt:Date.now(),
    images:body().images.map(({candidateId,filename,sourceReference,viewType})=>({candidateId,filename,sourceReference,viewType}))};
  const jobs = loadTs('src/lib/integration-jobs.ts', {
    '@vercel/blob': { get:async()=>({stream:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({status:'done',resultUrl:'private-secret-url'})));c.close();}})}) },
  });
  const result = await jobs.jobResponse(job);
  assert.equal(result.complete,true); assert.equal(result.images[0].candidateId,'c1');
  assert.ok(result.images[0].downloadUrl.startsWith('/api/integration/'));
  assert.equal(JSON.stringify(result).includes('private-secret-url'),false);
  const stale = loadTs('src/lib/integration-jobs.ts', {'@vercel/blob':{get:async()=>null}});
  job.createdAt = Date.now()-11*60*1000;
  assert.equal((await stale.jobResponse(job)).images[0].error,'processing_interrupted');
});

test('generation uses stored bytes and server prompts, isolates failures and records downloadable results', async () => {
  const states = new Map(); const calls = [];
  const jobs = loadTs('src/lib/integration-jobs.ts', {
    '@vercel/blob': { put: async (path, data) => {
      if (path.includes('/state-')) states.set(path, JSON.parse(data));
      return {url:'https://private/source.png'};
    } },
    '@/lib/process-image': { processImageRequest: async (request, signal) => {
      const payload = await request.json(); calls.push(payload);
      assert.ok(signal instanceof AbortSignal);
      return calls.length === 1 ? Response.json({resultUrl:'/api/blob?url=https%3A%2F%2Fprivate%2Fresult.png',cost:0.1}) : Response.json({error:'failed'}, {status:500});
    } },
  });
  const b = body(); b.images.push({...b.images[0],candidateId:'c2'});
  await jobs.runJob(b, {prompts:['server-front','server-back'],shotMode:'product',config:{modelProfileId:'',modelPoseType:'full_body'},settings:{imageSize:'1024x1024',imageQuality:'auto',outputFormat:'png'}});
  assert.deepEqual(calls.map(c=>c.prompt),['server-front','server-back']);
  assert.equal(calls[0].sourceUrl,'https://private/source.png');
  assert.deepEqual([...states.values()].map(s=>s.status),['done','error']);
  assert.equal([...states.values()][0].resultUrl,'https://private/result.png');
});

test('integration proxy requires bearer credentials even when a browser cookie is present', async () => {
  const prior = process.env.PHOTO_MAGIC_API_SECRET;
  try {
    process.env.PHOTO_MAGIC_API_SECRET = 'integration-test';
    const { proxy } = loadTs('src/proxy.ts', {
      'next/server': {NextResponse:{json:(b,o)=>Response.json(b,o),next:()=>new Response(null,{status:204})}},
      '@/lib/auth': {getAppPassword:()=>'',verifyAuthToken:async()=>true},
    });
    const req = new Request('http://local/api/integration/v1/options',{headers:{cookie:'auth=browser'}});
    req.nextUrl = new URL(req.url);
    assert.equal((await proxy(req)).status,401);
    req.headers.set('authorization','Bearer integration-test');
    assert.equal((await proxy(req)).status,204);
  } finally {if(prior===undefined) delete process.env.PHOTO_MAGIC_API_SECRET; else process.env.PHOTO_MAGIC_API_SECRET=prior;}
});

test('download checks auth before storage and streams only the job result', async () => {
  let read = 0;
  const mocks = {
    '@/lib/integration-auth': {integrationAuth:()=>Response.json({error:'unauthorized'},{status:401})},
    '@/lib/integration-jobs': {readJob:async()=>{read++;return {images:[{}]};},imageState:async()=>({status:'done',resultUrl:'private-job-result'})},
    '@vercel/blob': {get:async(url)=>{assert.equal(url,'private-job-result');return {stream:new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close();}}),blob:{contentType:'image/png'}};}},
  };
  const context = {params:Promise.resolve({jobId:body().requestId,index:'0'})};
  let route = loadTs('src/app/api/integration/v1/jobs/[jobId]/images/[index]/route.ts',mocks);
  assert.equal((await route.GET(new Request('http://local'),context)).status,401);
  assert.equal(read,0);
  mocks['@/lib/integration-auth'].integrationAuth=()=>null;
  route=loadTs('src/app/api/integration/v1/jobs/[jobId]/images/[index]/route.ts',mocks);
  const response=await route.GET(new Request('http://local'),context);
  assert.equal(response.headers.get('content-type'),'image/png');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);
});
