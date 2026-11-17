import test from 'node:test';import assert from 'node:assert/strict';
import {createRequestGuard,scopedStream,isSizeFailure,recoverRequest,offloadOlderImages,selectHistoryChunk,LIMIT_MARKER,pairingBalancedBefore,pairingBalancedAfter} from '../budget.mjs';
const ok=()=>new Response('{}',{status:200});
const metadata=()=>({provider:'fixture',model:'test'});
const post=body=>({method:'POST',headers:{'content-type':'application/json'},body});
test('complete UTF-8 JSON size is checked before any network call; body text never enters diagnostics',async()=>{
 let calls=0;const logs=[];const guard=createRequestGuard(async()=>{calls++;return ok();},{maxRequestBytes:1024,onRequest:x=>logs.push(x)});
 const body=JSON.stringify({messages:[{content:'PRIVATE-'+ '🌍'.repeat(300)}],tools:[{name:'x'}]});
 await assert.rejects(guard.scope.run(metadata(),()=>guard.fetch('http://fixture/messages',post(body))),new RegExp(LIMIT_MARKER));
 assert.equal(calls,0);assert.equal(logs[0].requestBytes,Buffer.byteLength(body));assert.ok(logs[0].sectionBytes.tools>0);
 assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
});
test('boundary-sized request passes unchanged; unrelated traffic is not inspected',async()=>{
 const seen=[];const guard=createRequestGuard(async(input,init)=>{seen.push({input,init});return ok();},{maxRequestBytes:1024});
 const body='{"x":"'+'x'.repeat(1016)+'"}';assert.equal(Buffer.byteLength(body),1024);
 const init=Object.freeze(post(body));await guard.scope.run(metadata(),()=>guard.fetch('http://fixture/messages',init));
 assert.equal(seen[0].init,init);
 await guard.fetch('http://ordinary/upload',post('x'.repeat(5000)));assert.equal(seen.length,2);
});
test('SDK Request bodies are measured without consuming the original request',async()=>{
 const guard=createRequestGuard(async input=>{assert.equal((await input.text()).length,100);return ok();},{maxRequestBytes:1024});
 const request=new Request('http://fixture/messages',post('x'.repeat(100)));
 await guard.scope.run(metadata(),()=>guard.fetch(request));
});
test('provider 413 lowers the next route budget and preserves the response',async()=>{
 let calls=0;const guard=createRequestGuard(async()=>{calls++;return new Response('too big',{status:413});},{maxRequestBytes:5000});
 const first=await guard.scope.run(metadata(),()=>guard.fetch('http://fixture/messages',post('x'.repeat(4000))));assert.equal(first.status,413);
 assert.equal(guard.budget(metadata()),3000);
 await assert.rejects(guard.scope.run(metadata(),()=>guard.fetch('http://fixture/messages',post('x'.repeat(4000)))));
 assert.equal(calls,1);
});
test('concurrent model routes keep independent byte budgets',async()=>{
 const calls=[];const guard=createRequestGuard(async(_,init)=>{calls.push(init.body.length);return ok();},{maxRequestBytes:5000,providerLimits:{small:1024}});
 const a=guard.scope.run({provider:'small',model:'test'},()=>guard.fetch('http://fixture/messages',post('x'.repeat(2000))));
 const b=guard.scope.run({provider:'large',model:'test'},()=>guard.fetch('http://fixture/messages',post('x'.repeat(2000))));
 const result=await Promise.allSettled([a,b]);assert.equal(result[0].status,'rejected');assert.equal(result[1].status,'fulfilled');assert.deepEqual(calls,[2000]);
});
test('multipart uploads bypass the JSON inference budget',async()=>{
 let calls=0;const guard=createRequestGuard(async()=>{calls++;return ok();},{maxRequestBytes:1024});
 const data=new FormData();data.append('file',new Blob(['x'.repeat(5000)]));
 await guard.scope.run(metadata(),()=>guard.fetch('http://fixture/files',{method:'POST',body:data}));assert.equal(calls,1);
});
test('SDK-flattened local rejections still become structured 413 failures',async()=>{
 const guard=createRequestGuard(async()=>{throw new Error('Must never send');},{maxRequestBytes:1024});
 const downstream=async function*(){try{await guard.fetch('http://fixture/messages',post('x'.repeat(2000)));}catch{yield {type:'finish',reason:{kind:'error',failure:{code:'TRANSPORT',message:'SDK removed the cause'}}};}};
 const chunks=[];for await(const item of scopedStream(guard,metadata(),downstream))chunks.push(item);
 assert.equal(chunks[0].reason.failure.status,413);assert.ok(isSizeFailure(chunks[0].reason.failure));
});
test('thrown SDK rejection is normalized, while ordinary failures are preserved',async()=>{
 const guard=createRequestGuard(async()=>ok(),{maxRequestBytes:1024});
 const downstream=async function*(){await guard.fetch('http://fixture/messages',post('x'.repeat(2000)));};
 const chunks=[];for await(const item of scopedStream(guard,metadata(),downstream))chunks.push(item);assert.equal(chunks[0].type,'finish');
 await assert.rejects(async()=>{for await(const item of scopedStream(guard,metadata(),async function*(){throw new Error('ordinary');})){}},/ordinary/);
});
test('cancellation prevents transmission',async()=>{
 let calls=0;const guard=createRequestGuard(async()=>{calls++;return ok();},{maxRequestBytes:1024});const control=new AbortController();control.abort();
 await assert.rejects(guard.scope.run({...metadata(),signal:control.signal},()=>guard.fetch('http://fixture/messages',post('{}'))));assert.equal(calls,0);
});
function session(messages){
 const events=new Map(messages.map((m,i)=>[i,{type:m.role==='user'?'user/message':m.role==='assistant'?'assistant/message':m.role==='system'?'system/message':'tool/result',message:m}]));
 const omitted=new Map();const log=[];let sequence=messages.length;
 return {id:'test',surface:{nodes:[...events.keys()]},log,events,
 eventAt:id=>events.get(id),deriveEventMessage(event){return {...event.message,content:event.message.content.map((b,i)=>b.type==='image'&&omitted.get(event)?.has(i)?{...b,offloaded:true}:b)};},
 append(type,data){log.push({type,data});if(type==='image/offload')for(const target of data.targets){const e=events.get(target.seq);const positions=[];e.message.content.forEach((b,i)=>{if(b.type==='image')positions.push(i)});omitted.set(e,new Set(target.imageIndexes.map(i=>positions[i])));}},
 replace(start,end,text){const id=sequence++;events.set(id,{type:'user/message',message:{role:'user',content:[{type:'text',text}]}});const a=this.surface.nodes.indexOf(start),b=this.surface.nodes.indexOf(end);this.surface.nodes.splice(a,b-a+1,id);}
 };
}
const text=(role,value)=>({role,content:[{type:'text',text:value}]});
test('recovery prunes durable results and never executes a tool',async()=>{
 const s=session([text('assistant','x'.repeat(30000)),text('user','current request')]);const original=s.events.get(0).message.content[0].text;
 const result=await recoverRequest({agent:{session:s},failure:{status:413},signal:new AbortController().signal},{pruner:{pruneSession(){s.replace(0,0,'pruned result');}}});
 assert.equal(result,true);assert.equal(s.events.get(0).message.content[0].text,original);
});
test('older images are durably offloaded while the newest is retained',()=>{
 const s=session([{role:'user',content:[{type:'image',url:'old'},{type:'image',url:'new'}]}]);assert.equal(offloadOlderImages(s),true);
 assert.equal(s.deriveEventMessage(s.events.get(0)).content[1].offloaded,undefined);assert.equal(s.log[0].type,'image/offload');
});
test('history selection keeps system head and latest user request out of compaction',()=>{
 const s=session([text('system','rules'),text('user','a'.repeat(20000)),text('assistant','b'.repeat(20000)),text('user','keep this')]);
 const chosen=selectHistoryChunk(s,()=>true,()=>true);assert.equal(chosen.start,1);assert.equal(chosen.end,2);
});
test('balanced boundaries prevent selecting an incomplete tool pair',()=>{
 const s=session([text('user','a'.repeat(20000)),text('assistant','b'.repeat(20000)),text('user','current')]);
 assert.equal(selectHistoryChunk(s,()=>true,()=>false),null);
});
test('bounded native compaction only retries after a real reduction',async()=>{
 const s=session([text('user','a'.repeat(20000)),text('assistant','b'.repeat(20000)),text('user','current')]);let compacted=0;
 const reduced=await recoverRequest({agent:{session:s},failure:{message:'413 too big'},signal:new AbortController().signal},{compaction:{async compactRegion(a,b){compacted++;s.replace(a,b,'retained summary');}},balancedBefore:()=>true,balancedAfter:()=>true});
 assert.equal(reduced,true);assert.equal(compacted,1);assert.equal(s.events.get(2).message.content[0].text,'current');
});
test('irreducible input, unchanged compaction and exhausted attempts do not retry',async()=>{
 const s=session([text('user','latest request')]);const payload={agent:{session:s},failure:{status:413},signal:new AbortController().signal};
 assert.equal(await recoverRequest(payload,{}),false);assert.equal(await recoverRequest(payload,{}, {attempts:8}),false);
 assert.equal(isSizeFailure({message:'500 upstream mentioned 413 in unrelated details'}),false);
});

test('completed steps in a long current turn can compact without replacing its user request',()=>{
 const s=session([text('user','Keep this exact goal'),text('assistant','a'.repeat(20000)),text('tool','b'.repeat(20000)),text('assistant','new call'),text('tool','new result')]);
 const chosen=selectHistoryChunk(s,()=>true,()=>true);assert.equal(chosen.start,1);assert.equal(chosen.end,2);
});
test('default eight-million-byte guard blocks a ten-megabyte request without sending it',async()=>{
 let calls=0;const guard=createRequestGuard(async()=>{calls++;return ok();});
 await assert.rejects(guard.scope.run(metadata(),()=>guard.fetch('http://fixture/messages',post(JSON.stringify({messages:[{content:'x'.repeat(10_000_000)}]})))));
 assert.equal(calls,0);
});

test('actual boundary selection keeps parallel tool-call/result groups together',()=>{
 const s=session([text('user','Goal'),{role:'assistant',content:[{type:'tool-call',id:'a'},{type:'tool-call',id:'b'}]},{role:'tool',source:{callId:'a'},content:[{type:'text',text:'result a'}]},{role:'tool',source:{callId:'b'},content:[{type:'text',text:'result b'}]},text('user','next')]);
 assert.equal(pairingBalancedBefore(s,1),true);assert.equal(pairingBalancedAfter(s,1),false);assert.equal(pairingBalancedAfter(s,2),false);assert.equal(pairingBalancedAfter(s,3),true);
});
