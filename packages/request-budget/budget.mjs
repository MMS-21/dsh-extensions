import {AsyncLocalStorage} from 'node:async_hooks';
const bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value),'utf8');
export const DEFAULT_LIMIT=8_000_000;
export const LIMIT_MARKER='DSH_REQUEST_BODY_TOO_LARGE';
export function isSizeFailure(failure) {
 if(failure?.status===413)return true;
 const text=failure?.message??'';
 return text.includes(LIMIT_MARKER)||/^413\b/.test(text)||/request in excess of \d+(?:\.\d+)?\s*(?:MB|MiB)|payload too large|request body too large|failed to buffer the request body:\s*length limit exceeded/i.test(text);
}
export function payloadStats(serialized) {
 const totalBytes=Buffer.byteLength(serialized,'utf8');
 const sections={};
 try {
  const value=JSON.parse(serialized);
  for(const key of ['messages','input','tools','system','instructions'])if(value[key]!==undefined)sections[key]=bytes(value[key]);
 }catch{/* Only byte counts are required; never log body text. */}
 return {requestBytes:totalBytes,sectionBytes:sections};
}
async function serializedBody(input,init) {
 const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
 if(method!=='POST')return null;
 const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
 const type=headers.get('content-type')??'';
 if(type && !/application\/(?:[a-z0-9.+-]+\+)?json/i.test(type))return null;
 const value=init?.body;
 if(typeof value==='string')return value;
 if(value instanceof Uint8Array)return Buffer.from(value).toString('utf8');
 if(value instanceof ArrayBuffer)return Buffer.from(value).toString('utf8');
 if(value===undefined && input instanceof Request && input.body!==null)return input.clone().text();
 if(value===undefined||value===null)return null;
 // Multipart file uploads are not inference JSON.
 if(value instanceof FormData || value instanceof URLSearchParams)return null;
 throw Object.assign(new Error('Request budget cannot safely measure this streaming JSON body; use a buffered JSON body.'),{code:'UNMEASURABLE_MODEL_REQUEST'});
}
export function createRequestGuard(originalFetch,{maxRequestBytes=DEFAULT_LIMIT,providerLimits={},onRequest=()=>{}}={}) {
 if(!Number.isSafeInteger(maxRequestBytes)||maxRequestBytes<1024)throw new Error('maxRequestBytes must be an integer >=1024');
 const scope=new AsyncLocalStorage();
 const learned=new Map();
 const route=meta=>meta.provider+'/'+meta.model;
 const budget=meta=>Math.min(providerLimits[meta.provider]??maxRequestBytes,learned.get(route(meta))??Infinity);
 const wrapped=async function(input,init) {
  const meta=scope.getStore();
  if(!meta)return originalFetch(input,init);
  meta.signal?.throwIfAborted();
  const serialized=await serializedBody(input,init);
  if(serialized===null)return originalFetch(input,init);
  const stats=payloadStats(serialized);
  const limit=budget(meta);
  const diagnostic={provider:meta.provider,model:meta.model,purpose:meta.purpose??'conversation',...stats,limitBytes:limit};
  meta.latest=diagnostic;
  if(stats.requestBytes>limit){
   meta.blocked=true;
   onRequest({...diagnostic,outcome:'blocked-before-network'});
   throw Object.assign(new Error(`${LIMIT_MARKER}: requestBytes=${stats.requestBytes}, limitBytes=${limit}. Harness recovery must reduce the durable context before retrying.`),{code:LIMIT_MARKER,status:413});
  }
  meta.signal?.throwIfAborted();
  const response=await originalFetch(input,init);
  if(response.status===413){
   meta.rejected413=true;
   // A gateway may enforce a smaller limit than the configured route.
   learned.set(route(meta),Math.max(1024,Math.min(limit-1,Math.floor(stats.requestBytes*0.75))));
   onRequest({...diagnostic,outcome:'provider-rejected-413',nextLimitBytes:budget(meta)});
  }else onRequest({...diagnostic,outcome:'sent',status:response.status});
  return response;
 };
 return {fetch:wrapped,scope,budget};
}
function sizeFinish(metadata) {
 const stats=metadata.latest;
 return {type:'finish',reason:{kind:'error',failure:{code:'HTTP_413',status:413,
  message:`${LIMIT_MARKER}: requestBytes=${stats?.requestBytes??'unknown'}, limitBytes=${stats?.limitBytes??'unknown'}. Request context must be reduced before retrying.`}}};
}
export async function* scopedStream(guard,metadata,next) {
 const iterator=guard.scope.run(metadata,()=>next()[Symbol.asyncIterator]());
 try {
  for(;;){
   const item=await guard.scope.run(metadata,()=>iterator.next());
   if(item.done)return;
   if(item.value?.type==='finish' && (metadata.blocked||metadata.rejected413))yield sizeFinish(metadata);
   else yield item.value;
  }
 }catch(error){
  if((metadata.blocked||metadata.rejected413)&&!metadata.signal?.aborted)yield sizeFinish(metadata);
  else throw error;
 }finally{if(iterator.return)await guard.scope.run(metadata,()=>iterator.return());}
}
export function retainedImages(session) {
 const images=[];
 for(const seq of session.surface.nodes){
  const event=session.eventAt(seq);
  if(!event || !['user/message','tool/result'].includes(event.type))continue;
  const message=session.deriveEventMessage(event);let index=0;
  for(const block of message?.content??[])if(block.type==='image'){
   if(block.offloaded!==true)images.push({seq,index});index++;
  }
 }
 return images;
}
export function offloadOlderImages(session) {
 const images=retainedImages(session);
 if(images.length<2)return false; // Preserve the most recent image supplied for the task.
 const selected=images.slice(0,Math.max(1,Math.floor(images.length/2)));
 const targets=[];
 for(const image of selected){let target=targets.find(x=>x.seq===image.seq);if(!target){target={seq:image.seq,imageIndexes:[]};targets.push(target);}target.imageIndexes.push(image.index);}
 session.append('image/offload',{targets});
 // Retry only when the installed projection actually applied the durable decision.
 return retainedImages(session).length<images.length;
}
export function surfaceBytes(session) {
 let total=0;
 for(const seq of session.surface.nodes){const event=session.eventAt(seq);const message=event && session.deriveEventMessage(event);if(message)total+=bytes(message);}
 return total;
}
function balancedAt(session,seq,inclusive) {
 const nodes=session.surface.nodes;const position=nodes.indexOf(seq);
 if(position<0)return false;
 const pending=new Set();
 for(let index=0;index<position+(inclusive?1:0);index++){
  const event=session.eventAt(nodes[index]);const message=event && session.deriveEventMessage(event);
  if(event?.type==='assistant/message')for(const block of message?.content??[])if(block.type==='tool-call')pending.add(block.id);
  if(event?.type==='tool/result')pending.delete(message?.toolCallId??message?.source?.callId);
 }
 return pending.size===0;
}
export const pairingBalancedBefore=(session,seq)=>balancedAt(session,seq,false);
export const pairingBalancedAfter=(session,seq)=>balancedAt(session,seq,true);
export function selectHistoryChunk(session,balancedBefore,balancedAfter,maxBytes=2_000_000) {
 const nodes=[...session.surface.nodes];
 let latestUser=-1;
 for(let i=nodes.length-1;i>=0;i--){
  const event=session.eventAt(nodes[i]);const message=event && session.deriveEventMessage(event);
  if(event?.type==='user/message' && (message?.source===undefined||message.source.kind==='user')){latestUser=i;break;}
 }
 // Keep the current user request verbatim. Completed steps after that request
 // can still be summarized, with the newest two nodes and tool pairs retained.
 const ranges=latestUser<0?[[0,Math.max(0,nodes.length-2)]]:[[0,latestUser],[latestUser+1,Math.max(latestUser+1,nodes.length-2)]];
 for(const [from,to] of ranges){
  let start=-1,end=-1,total=0,count=0;
  for(let i=from;i<to;i++){
   const seq=nodes[i],event=session.eventAt(seq),message=event && session.deriveEventMessage(event);
   if(!message)continue;
   if(start<0){if(event.type==='system/message')continue;if(!balancedBefore(session,seq))continue;start=i;}
   const size=bytes(message);
   if(total+size>maxBytes)break;
   total+=size;count++;
   if(balancedAfter(session,seq))end=i;
  }
  if(start>=0&&end>start&&count>=2&&total>=16384)return {start:nodes[start],end:nodes[end],estimatedBytes:total};
 }
 return null;
}
export async function recoverRequest({agent,failure,signal},{pruner,compaction,balancedBefore,balancedAfter},state={attempts:0},maximum=8) {
 if(!isSizeFailure(failure)||signal.aborted||state.attempts>=maximum)return false;
 const session=agent.session;
 const before=surfaceBytes(session);
 if(pruner){pruner.pruneSession(session);signal.throwIfAborted();if(surfaceBytes(session)<before){state.attempts++;return true;}}
 if(offloadOlderImages(session)){signal.throwIfAborted();state.attempts++;return true;}
 if(!compaction||!balancedBefore||!balancedAfter)return false;
 const chunk=selectHistoryChunk(session,balancedBefore,balancedAfter);
 if(!chunk)return false;
 await compaction.compactRegion(chunk.start,chunk.end,agent,signal);
 signal.throwIfAborted();
 if(surfaceBytes(session)>=before)return false;
 state.attempts++;return true;
}
