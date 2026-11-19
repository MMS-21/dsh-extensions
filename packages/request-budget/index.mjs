import {mkdirSync,statSync,appendFileSync,writeFileSync,readFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequestGuard,scopedStream,recoverRequest,isSizeFailure,DEFAULT_LIMIT,pairingBalancedBefore,pairingBalancedAfter} from './budget.mjs';
export const name='request-budget';
export const inject=['llm','agents','sessions'];
function service(ctx,key){try{return ctx.get?.(key)??ctx[key];}catch{return undefined;}}
function boundedDiagnostic(path,entry){
 try{
  mkdirSync(dirname(path),{recursive:true});
  if(statSync(path,{throwIfNoEntry:false})?.size>1_000_000){
   const recent=readFileSync(path,'utf8').split('\n').slice(-200).join('\n');
   writeFileSync(path+'.tmp',recent);renameSync(path+'.tmp',path);
  }
  appendFileSync(path,JSON.stringify({at:new Date().toISOString(),...entry})+'\n');
 }catch{/* Diagnostics must not turn a successful model response into a failure. */}
}
export async function apply(ctx,config={},internals={}) {
 const allowed=new Set(['maxRequestBytes','providerLimits','maxRecoveryAttempts','diagnosticPath']);
 for(const key of Object.keys(config))if(!allowed.has(key))throw new Error('request-budget: unknown configuration key '+key);
 const maximum=config.maxRecoveryAttempts??8;
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>32)throw new Error('maxRecoveryAttempts must be 1–32');
 for(const value of Object.values(config.providerLimits??{}))if(!Number.isSafeInteger(value)||value<1024)throw new Error('providerLimits must contain integer byte limits >=1024');
 const diagnosticPath=config.diagnosticPath??fileURLToPath(new URL('./.runtime/request-sizes.jsonl',import.meta.url));
 const helpers=internals.helpers??{toolPairingBalancedBefore:pairingBalancedBefore,toolPairingBalancedAfter:pairingBalancedAfter};
 const metadataBySession=new Map();
 const attempts=new WeakMap();
 const original=internals.fetch??globalThis.fetch;
 const guard=createRequestGuard(original,{maxRequestBytes:config.maxRequestBytes??DEFAULT_LIMIT,
  providerLimits:config.providerLimits??{},onRequest:entry=>boundedDiagnostic(diagnosticPath,entry)});
 ctx.effect(()=>{
  globalThis.fetch=guard.fetch;
  return ()=>{if(globalThis.fetch===guard.fetch)globalThis.fetch=original;metadataBySession.clear();};
 });
 ctx.on('llm/stream',function(options,next){
  const meta={provider:options.provider,model:options.model,purpose:options.purpose,signal:options.signal};
  if(options.purpose===undefined && options.sessionId!==undefined)metadataBySession.set(String(options.sessionId),meta);
  return scopedStream(guard,meta,next);
 },{prepend:true});
 // Bound individual tool results before token-pressure policy even runs.
 ctx.on('agent/pre-step',async({agent,signal},next)=>{
  signal.throwIfAborted();
  service(ctx,'toolResultPruner')?.pruneSession(agent.session);
  return next();
 },{prepend:true});
 ctx.on('agent/request-error',async(payload,next)=>{
  if(!isSizeFailure(payload.failure)||payload.signal.aborted)return next();
  let state=attempts.get(payload.agent);
  const key=payload.turn+':'+payload.step;
  if(!state||state.key!==key){state={key,attempts:0};attempts.set(payload.agent,state);}
  const meta=metadataBySession.get(String(payload.agent.session.id));
  try{
   const reduced=await recoverRequest(payload,{
    pruner:service(ctx,'toolResultPruner'),compaction:service(ctx,'compaction'),
    balancedBefore:helpers.toolPairingBalancedBefore,balancedAfter:helpers.toolPairingBalancedAfter,
   },state,maximum);
   boundedDiagnostic(diagnosticPath,{outcome:reduced?'recovered-context':'cannot-reduce-safely',
    provider:payload.provider,attempt:state.attempts,requestBytes:meta?.latest?.requestBytes});
   if(reduced)return {kind:'retry'};
  }catch(error){
   payload.signal.throwIfAborted();
   boundedDiagnostic(diagnosticPath,{outcome:'recovery-failed',errorType:error?.constructor?.name??'Error'});
  }
  // Do not delegate a known oversized payload to an unbounded same-body retry policy.
  return undefined;
 },{prepend:true});
 ctx.on('agent/status',({agent,status})=>{if(status==='idle'){attempts.delete(agent);metadataBySession.delete(String(agent.session.id));}});
}
