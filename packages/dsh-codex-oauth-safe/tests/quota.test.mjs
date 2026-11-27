import test from 'node:test';
import assert from 'node:assert/strict';
import {readQuota,parseQuota,QUOTA_URL} from '../quota-core.mjs';
import {createQuotaService} from '../quota-service.mjs';
import {emptyQuota} from '../quota-core.mjs';
import {parseSnapshot} from '../quota-schema.mjs';
const sample={type:'oauth',access:'synthetic-secret',refresh:'synthetic-refresh',expires:Date.now()+600000,accountId:'synthetic-account'};
const fixture={rate_limit:{primary_window:{used_percent:37,limit_window_seconds:18000,reset_at:1900000000},secondary_window:{used_percent:12,limit_window_seconds:604800,reset_at:1900000100}},secret:'must-not-return'};
test('quota parse uses real percentages and reset times, discards other fields',()=>{const q=parseQuota(fixture,123);assert.equal(q.status,'ok');assert.deepEqual(q.windows.map(w=>[w.label,w.usedPercent,w.resetAt]),[['5 hours',37,1900000000000],['Weekly',12,1900000100000]]);assert.ok(!JSON.stringify(q).includes('must-not-return'));});
test('invalid or absent percentages are unknown, not zero',()=>{assert.equal(parseQuota({}).status,'unavailable');assert.equal(parseQuota({rate_limit:{primary_window:{used_percent:-1},secondary_window:{used_percent:'0'}}}).status,'unavailable');assert.equal(parseQuota({rate_limit:{primary_window:{used_percent:0}}}).windows[0].usedPercent,0);});
test('quota requests fixed HTTPS host, rejects redirects and returns metadata only',async()=>{const q=await readQuota(sample,async(url,opt)=>{assert.equal(url,QUOTA_URL);assert.equal(opt.redirect,'error');assert.equal(opt.headers.Authorization,'Bearer synthetic-secret');assert.equal(opt.headers['ChatGPT-Account-Id'],'synthetic-account');return new Response(JSON.stringify(fixture));});assert.equal(q.status,'ok');assert.ok(!JSON.stringify(q).includes('synthetic'));});
test('signed-out and expired credentials do not make requests',async()=>{let calls=0;const f=async()=>{calls++;throw Error('unexpected');};assert.equal((await readQuota(undefined,f)).status,'signed-out');assert.equal((await readQuota({...sample,expires:0},f)).status,'expired');assert.equal(calls,0);});
test('HTTP failures, redirects, oversized or invalid responses do not leak details',async()=>{const c=sample;assert.equal((await readQuota(c,async()=>new Response('',{status:401}))).status,'expired');assert.equal((await readQuota(c,async()=>new Response('',{status:429}))).status,'rate-limited');assert.equal((await readQuota(c,async()=>{throw Error('synthetic-secret')})).status,'unavailable');assert.equal((await readQuota(c,async()=>new Response('x'.repeat(270000)))).status,'unavailable');assert.equal((await readQuota(c,async()=>new Response('not JSON'))).status,'unavailable');});
test('native grant is read only, concurrent requests coalesce and account switch invalidates cache',async()=>{
 let record={kind:'grant',payload:sample};let calls=0;
 const svc=createQuotaService(async()=>record,{request:async()=>{calls++;return new Response(JSON.stringify(fixture));},fallback:async()=>emptyQuota('signed-out')});
 const values=await Promise.all([svc.query(),svc.query(),svc.query()]);
 assert.equal(calls,1);assert.equal(values[0].status,'ok');assert.equal((await svc.query()).status,'ok');assert.equal(calls,1);
 record={kind:'grant',payload:{...sample,access:'other-account'}};await svc.query();assert.equal(calls,2);
 record=undefined;assert.equal((await svc.query()).status,'signed-out');assert.equal(calls,2);
});
test('wrong credential type and invalid expiry do not make requests',async()=>{
 let record={kind:'api-key',key:'not-oauth'};let calls=0;
 const svc=createQuotaService(async()=>record,{request:async()=>{calls++;throw Error('unexpected');},fallback:async()=>emptyQuota(record?.kind==='grant'?'expired':'signed-out')});
 assert.equal((await svc.query()).status,'signed-out');record={kind:'grant',payload:{...sample,expires:NaN}};
 assert.equal((await svc.query()).status,'expired');assert.equal(calls,0);
});
test('RPC schema strips unknown fields and rejects invalid snapshots',()=>{
 const q=parseQuota(fixture);const out=parseSnapshot({...q,token:'secret',windows:q.windows.map(w=>({...w,secret:'never-send'}))});
 assert.deepEqual(out,q);assert.throws(()=>parseSnapshot({...q,windows:[{...q.windows[0],usedPercent:101}]}));assert.throws(()=>parseSnapshot({...q,status:'expired'}));
});
test('late response from prior account is discarded',async()=>{
 let record={kind:'grant',payload:sample};let resolve;
 const svc=createQuotaService(async()=>record,{request:()=>new Promise(r=>{resolve=r;}),fallback:async()=>emptyQuota('signed-out')});
 const first=svc.query();await new Promise(r=>setImmediate(r));record=undefined;
 assert.equal((await svc.query()).status,'signed-out');resolve(new Response(JSON.stringify(fixture)));assert.equal((await first).status,'unavailable');
});

test('current Codex rate-limit shapes retain live percentages',()=>{
 const item={usedPercent:68,windowDurationMins:10080,resetsAt:1900000100};
 assert.deepEqual(parseQuota({rateLimits:{codex:{primary:{usedPercent:7,windowDurationMins:300,resetsAt:1900000000},secondary:item}}}).windows.map(w=>w.usedPercent),[7,68]);
 assert.equal(parseQuota({rate_limits:{rate_limit:{primary_window:{used_percent:68,limit_window_seconds:604800}}}}).windows[0].label,'Weekly');
});

test('unavailable native quota falls back to live Codex limits without caching the failure',async()=>{
 let nativeCalls=0,fallbackCalls=0;
 const svc=createQuotaService(async()=>({kind:'grant',payload:sample}),{
  request:async()=>{nativeCalls++;return new Response('',{status:503});},
  fallback:async accountId=>{fallbackCalls++;assert.equal(accountId,'synthetic-account');return parseQuota(fixture);}
 });
 assert.equal((await svc.query()).status,'ok');assert.equal((await svc.query()).status,'ok');
 assert.equal(nativeCalls,1);assert.equal(fallbackCalls,1);
});
