import {randomUUID} from 'node:crypto';
import {observation,residue,parseDream,redact,wakeText,SYSTEM} from './model.js';
export class Dreamer{
  constructor(ctx,store,config,clock=Date.now,record=(session,type,data)=>session.append('dreamer/'+type,data)){this.ctx=ctx;this.store=store;this.config=config;this.clock=clock;this.record=record;this.startedAt=clock();this.active=new Set();this.busy=null;this.disposed=false;this.sessions=new Map();}
  activeCount(){const ids=new Set(this.active);for(const id of this.sessions.keys())if(this.ctx.agents?.get(id)?.status==='running')ids.add(id);return ids.size;}
  observe(session,event){
    this.sessions.set(session.id,session);
    if(event.type.startsWith('dreamer/')||event.type.startsWith('plugin:dreamer/'))return Promise.resolve();
    if(event.type==='turn/start'){this.active.add(session.id);if(this.busy?.automatic)this.busy.controller.abort();}
    if(event.type==='turn/end'||event.type==='session/disposed')this.active.delete(session.id);
    const item=observation(session,event);
    const route=event.type==='request/header'?event.data?.header?.config:null;
    const wake=event.type==='user/message'&&event.data?.source?.kind==='dreamer-wake'?event.data.source.dreamId:null;
    if(!item&&!route&&!wake&&!['turn/start','turn/end'].includes(event.type))return Promise.resolve();
    return this.store.mutate(state=>{
      if(item){state.observations=[...state.observations.filter(old=>old.id!==item.id),item].slice(-500);}
      if(item||event.type==='turn/start'||event.type==='turn/end'){state.lastActivityAt=this.clock();state.lastSessionId=session.id;}
      if(route?.provider&&route?.model){state.lastRoute={provider:route.provider,model:route.model};state.lastRouteAt=event.time;}
      if(wake){const dream=state.dreams.find(dream=>dream.id===wake);if(dream&&dream.claim?.sessionId===session.id){dream.wakedAt=this.clock();dream.wakedSession=session.id;delete dream.claim;}}
      if(event.type==='turn/end')for(const dream of state.dreams)if(!dream.wakedAt&&dream.claim?.sessionId===session.id)delete dream.claim;
      return state;
    });
  }
  status(){const state=this.store.read(),now=this.clock();return {enabled:this.config.enabled,automatic:this.config.automatic,busy:Boolean(this.busy),activeSessions:this.activeCount(),idleMinutes:Math.max(0,(now-Math.max(this.startedAt,state.lastActivityAt))/60000),dreams:state.totalDreams,journalRetained:state.dreams.length,classImbalanceOverrepeats:state.classImbalanceCount,staleUndelivered:state.dreams.filter(dream=>!dream.wakedAt&&now-dream.at>=48*3600000).length,pendingWake:state.dreams.some(dream=>!dream.wakedAt&&now-dream.at<48*3600000),lastDreamAt:state.lastDreamAt||null,lastError:this.observerError||state.error,historyBackfill:this.backfillStatus||null,route:this.config.provider?{provider:this.config.provider,model:this.config.model}:state.lastRoute};}
  async backfill(signal){
    const persistence=this.persistence;
    if(!persistence){this.backfillStatus={available:false};return;}
    const rows=(await persistence.list()).filter(row=>row.header.createdAt>=this.clock()-14*86400000).sort((a,b)=>b.header.createdAt-a.header.createdAt).slice(0,50);
    const incoming=[];let failures=0,lastRoute=null;
    for(const row of rows){
      signal.throwIfAborted();let reader;
      try{
        reader=await persistence.open(row.header.id,'read',{signal});
        const result=await reader.read(Math.max(0,(row.eventCount||200)-200),200,{signal});
        for(const event of result.events){
          const item=observation({id:row.header.id},event);if(item)incoming.push(item);
          const route=event.type==='request/header'?event.data?.header?.config:null;
          if(route?.provider&&route?.model&&(!lastRoute||event.time>lastRoute.at))lastRoute={provider:route.provider,model:route.model,at:event.time};
        }
      }catch(error){signal.throwIfAborted();failures++;}finally{await reader?.close();}
    }
    await this.store.mutate(state=>{
      const all=new Map(state.observations.map(item=>[item.id,item]));for(const item of incoming)if(!all.has(item.id))all.set(item.id,item);
      state.observations=[...all.values()].sort((a,b)=>a.at-b.at).slice(-500);
      state.lastActivityAt=Math.max(state.lastActivityAt,...incoming.map(item=>item.at));
      if(lastRoute&&lastRoute.at>(state.lastRouteAt||0)){state.lastRoute={provider:lastRoute.provider,model:lastRoute.model};state.lastRouteAt=lastRoute.at;}
      return state;
    });
    this.backfillStatus={available:true,sessions:rows.length,observations:incoming.length,skipped:failures};
  }
  async tick(){
    await this.store.flush?.();
    const state=this.store.read(),now=this.clock();
    if(!this.config.enabled||!this.config.automatic||this.disposed||this.busy||this.activeCount()||this.observerError)return;
    if(now-Math.max(this.startedAt,state.lastActivityAt)<this.config.idleMinutes*60000||now-Math.max(state.lastDreamAt,state.lastAttemptAt)<this.config.intervalMinutes*60000)return;
    return this.run({automatic:true});
  }
  async run({automatic=false,session,signal,topics=''}={}){
    if(!this.config.enabled)throw Error('Dreamer is disabled');
    if(this.disposed)throw Error('Dreamer is stopping');
    if(this.busy)throw Error('A dream is already in progress');
    if(automatic&&this.activeCount())throw Error('A session is active');
    const controller=new AbortController();const abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
    const timeout=setTimeout(abort,this.config.timeoutMs);timeout.unref?.();
    let settled;
    this.busy={controller,automatic,done:new Promise(resolve=>settled=resolve)};
    try{
      await this.store.flush?.();
      await this.backfill(controller.signal);
      const now=this.clock(),state=this.store.read();
      if(automatic&&(this.activeCount()||now-Math.max(this.startedAt,state.lastActivityAt)<this.config.idleMinutes*60000))throw Error('Work resumed before the idle reflection started');
      const idle=now-Math.max(this.startedAt,state.lastActivityAt);
      const phase=(state.totalDreams+1)%5===0||(idle>=this.config.deepSleepMinutes*60000&&idle<this.config.deepSleepMinutes*8*60000)?'deep':'light';
      const input=residue(state,now,phase);
      while(JSON.stringify(input).length>24000&&input.observations.length>1)input.observations.shift();
      if(!input.observations.length)throw Error('No observed session activity is available yet');
      const route=this.config.provider?{provider:this.config.provider,model:this.config.model}:state.lastRoute;
      if(!route)throw Error('No model route is known yet. Use a model in DSH or configure provider/model.');
      const audit=session||this.sessions.get(state.lastSessionId)||this.ctx.sessions.get(state.lastSessionId)||[...this.sessions.values()].at(-1);
      if(!audit)throw Error('No live session is available to record the exact model request');
      await this.store.mutate(current=>({...current,lastAttemptAt:now,error:null}));
      let complaint='',dream;
      for(let attempt=0;attempt<2;attempt++){
        controller.signal.throwIfAborted();
        const prompt=JSON.stringify({...input,topics:redact(topics,300),qualityComplaint:complaint});
        const maxTokens=phase==='deep'?Math.max(1200,this.config.maxTokens):this.config.maxTokens;
        const call=await this.ctx.llm.prepareCall({...route,maxTokens},controller.signal,(controls,model)=>{
          const effort=model.reasoning?.efforts?.[0]?.id;
          return {...controls,...effort?{reasoningEffort:effort}:{}};
        });
        const messages=[{id:randomUUID(),role:'user',source:{kind:'dreamer-request'},content:[{type:'text',text:prompt}]}];
        this.record(audit,'request',{system:SYSTEM,messages,config:JSON.parse(JSON.stringify(call.config)),phase,attempt});
        let text='',finish;const blocks=new Map();
        for await(const chunk of call.stream({...call.config,system:SYSTEM,messages,sessionId:audit.id,purpose:'dreamer',signal:controller.signal})){
          controller.signal.throwIfAborted();
          if(chunk.type==='text-delta')blocks.set(chunk.index||0,(blocks.get(chunk.index||0)||'')+chunk.text);
          if(chunk.type==='block-end'&&chunk.block?.type==='text')blocks.set(chunk.index||0,chunk.block.text);
          text=[...blocks.values()].join('');
          if(text.length>20000)throw Error('Dream output exceeds its limit');
          if(chunk.type==='tool-call-start'||chunk.type==='tool-call-delta'||chunk.type==='block-start'&&chunk.blockType==='tool-call'||chunk.type==='block-end'&&chunk.block?.type==='tool-call')throw Error('Dream generation must not use tools');
          if(chunk.type==='finish')finish=chunk.reason;
        }
        this.record(audit,'response',{attempt,text:redact(text,20000),finish:finish?.kind||'missing'});
        if(finish?.kind!=='stop')throw Error(`Dream model did not finish successfully (${finish?.kind||'missing'})`);
        try{dream=parseDream(text,input);break;}catch(error){complaint=redact(error.message);if(attempt===1)throw error;}
      }
      controller.signal.throwIfAborted();
      const row={...dream,id:randomUUID(),at:this.clock(),route,observationCount:input.observations.length};
      await this.store.mutate(current=>{
        const classes=current.dreams.slice(-5).map(dream=>dream.class);
        const counts=new Map();for(const name of classes)counts.set(name,(counts.get(name)||0)+1);
        const dominant=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];
        if(new Set(classes).size<4&&dominant===row.class)current.classImbalanceCount++;
        current.totalDreams++;
        current.dreams=[...current.dreams,row];current.lastDreamAt=row.at;current.error=null;
        const symbols=new Map(current.lexicon.filter(item=>row.at-item.at<=30*86400000).map(item=>[item.symbol,item]));
        for(const item of row.symbols)symbols.set(item.symbol,{...item,at:row.at});current.lexicon=[...symbols.values()].slice(-50);
        return current;
      });
      return row;
    }catch(error){await this.store.mutate(state=>({...state,error:redact(error.message)}));throw error;}
    finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);this.busy=null;settled();}
  }
  async claimWake(sessionId){
    if(!this.config.enabled)return null;
    let selected=null;const now=this.clock();
    await this.store.mutate(state=>{
      const dream=[...state.dreams].reverse().find(dream=>!dream.wakedAt&&now-dream.at<48*3600000);
      if(!dream)return state;
      if(dream.claim&&dream.claim.sessionId!==sessionId&&now-dream.claim.at<10*60000)return state;
      dream.claim={sessionId,at:now};selected=dream;return state;
    });
    return selected?{id:randomUUID(),role:'user',source:{kind:'dreamer-wake',dreamId:selected.id},content:[{type:'text',text:wakeText(selected,this.config.injectMaxChars)}]}:null;
  }
  async dispose(){this.disposed=true;const busy=this.busy;busy?.controller.abort();await busy?.done;}
}
