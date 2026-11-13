import {openStore} from './lib/store.js';
import {configOf} from './lib/model.js';
import {redact} from './lib/model.js';
import {Dreamer} from './lib/engine.js';
export const name='dreamer';
export const inject=['tools','sessions','llm','storageDomain','agents'];
const output={schema:{type:'object'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
export async function apply(ctx,rawConfig={},runtime={}){
  const config=configOf(rawConfig);
  let appendRecord=runtime.appendPluginRecord;
  if(!appendRecord){
    let loader;try{loader=ctx.get?.('loader');}catch{}
    const native=loader?await loader.import('@deepseek-ai/dsh-session'):await import('@deepseek-ai/dsh-session');
    appendRecord=native.appendPluginRecord;
    if(typeof appendRecord!=='function')throw Error('This DSH runtime does not expose plugin audit records');
  }
  const store=await openStore(ctx);
  const engine=new Dreamer(ctx,store,config,Date.now,(session,type,data)=>appendRecord(session,'plugin:dreamer/'+type,data));
  let timer;
  ctx.effect(()=>async()=>{clearInterval(timer);await engine.dispose();await store.close();},'dreamer: stop scheduler and flush storage');
  try{engine.persistence=ctx.get?.('sessionPersistence');}catch{}
  const observe=(session,event)=>{void engine.observe(session,event).then(value=>{if(value!==undefined)engine.observerError=null;}).catch(error=>{engine.observerError=redact(error.message);});};
  ctx.on('session/event',observe);
  ctx.on('session/disposed',session=>engine.active.delete(session.id));
  ctx.on('agent/pre-step',async({agent,turn,step,signal},next)=>{
    const decision=await next();
    if(decision.kind==='reject'||signal.aborted||turn!==1||step!==1||decision.messages.some(message=>message.source?.kind==='dreamer-wake'))return decision;
    try{const wake=await engine.claimWake(agent.session.id);return wake?{...decision,messages:[wake,...decision.messages]}:decision;}catch{return decision;}
  },{prepend:true});
  const register=(definition)=>ctx.tools.register({...definition,output});
  register({name:'dream_now',description:'Reflect on observed recent DSH work using the configured model. Makes a bounded model call without tools; stores only grounded dreams. Does not execute insights.',parameters:{type:'object',additionalProperties:false,properties:{topics_hint:{type:'string',maxLength:300}}},async execute(args,exec){try{return {ok:true,dream:await engine.run({session:exec.agent.session,signal:exec.signal,topics:args?.topics_hint||''})};}catch(error){return {ok:false,error:String(error.message)};}}});
  register({name:'dream_journal',description:'Read the local Dreamer journal, latest first. Read-only; does not call the model.',parameters:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:20}}},async execute(args){await store.flush();return {ok:true,dreams:store.read().dreams.slice(-Math.max(1,Math.min(20,args?.limit||5))).reverse()};}});
  register({name:'dream_status',description:'Read Dreamer idle state, last model route, journal count and errors. Does not trigger a dream.',parameters:{type:'object',additionalProperties:false,properties:{}},async execute(){await store.flush();return {ok:true,...engine.status()};}});
  let commands;try{commands=ctx.get?.('commands');}catch{}
  if(commands)commands.register({name:'dream',description:'Read the latest dream; /dream now [topic] generates one; /dream status reads idle state.',input:{hint:'[now [topic] | status | journal]'},async handler({agent,rawInput,signal}){
    const input=rawInput.trim();
    try{
      if(/^now(?:\s|$)/.test(input))return {kind:'success',text:JSON.stringify(await engine.run({session:agent.session,signal,topics:input.slice(3).trim()}))};
      await store.flush();
      if(input==='status')return {kind:'success',text:JSON.stringify(engine.status())};
      if(input&&input!=='journal')return {kind:'error',text:'Use /dream, /dream now [topic], /dream status or /dream journal.'};
      const dreams=store.read().dreams.slice(input==='journal'?-5:-1).reverse();
      return {kind:'success',text:dreams.length?JSON.stringify(dreams):'The dream journal is empty. Use /dream now after some session activity.'};
    }catch(error){return {kind:'error',text:redact(error.message)};}
  }});
  timer=setInterval(()=>{void engine.tick()?.catch(()=>{});},60000);timer.unref?.();
}
