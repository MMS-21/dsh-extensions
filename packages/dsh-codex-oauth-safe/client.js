// Native DSH lazy client module; no browser network requests or credential access.
window.__ModuleLoader__.load({id:'dsh-codex-oauth-safe',factory:(require)=>{
  const React=require('react'), h=React.createElement;
  const inject=['slots','remote'];
  const descriptor={package:'dsh-codex-oauth-safe',descriptors:[{id:'dsh-codex-oauth-safe#safeCodexQuota/query',service:'safeCodexQuota',namespace:'safeCodexQuota',method:'query',invocation:{kind:'direct'},parameters:[],result:{mode:'strict',typeSymbol:'dsh-codex-oauth-safe#Quota',schema:{parse:v=>v}}}]};
  const statusText={'signed-out':'Sign in to OpenAI Codex in DSH Settings → Models','expired':'Run a native Codex request to refresh, or sign in again','vault-locked':'Native credential store unavailable','rate-limited':'Quota service rate limited','unavailable':'Quota unavailable; not zero usage'};
  const ring=(percent)=>h('svg',{viewBox:'0 0 24 24',width:19,height:19,'aria-hidden':true},h('circle',{cx:12,cy:12,r:9,fill:'none',stroke:'currentColor',strokeWidth:3,opacity:.18}),percent==null?null:h('circle',{cx:12,cy:12,r:9,fill:'none',stroke:percent>=90?'#e05252':percent>=70?'#d49b35':'#34a853',strokeWidth:3,strokeLinecap:'round',strokeDasharray:`${percent*0.5655} 56.55`,transform:'rotate(-90 12 12)'}));
  const displayReset=(n)=>n==null?'Reset unavailable':n<=Date.now()?'Reset due; refresh to confirm':`Resets ${new Date(n).toLocaleString()}`;
  function Chip({directory,load,available,query,seat}) {
    const subscribe=React.useCallback(cb=>directory?directory.subscribe(cb):()=>{},[directory]);
    const snapshot=React.useSyncExternalStore(subscribe,()=>directory?directory.getSnapshot():null);
    const active=available&&snapshot?.current?.provider==='openai-codex'&&snapshot?.routable!=null;
    const [data,setData]=React.useState(null),[open,setOpen]=React.useState(false),[nonce,refresh]=React.useReducer(x=>x+1,0),[dockPresent,setDockPresent]=React.useState(true);
    React.useEffect(()=>{if(available)load?.();},[available,directory]);
    React.useEffect(()=>{if(seat!=='hero')return;const check=()=>setDockPresent(!!document.querySelector('[data-slot="conversation.composer.dock"]'));check();const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();},[seat]);
    const visible=active&&(seat!=='hero'||!dockPresent);
    React.useEffect(()=>{if(!visible){setData(null);setOpen(false);return;}let alive=true,busy=false;const tick=async()=>{if(busy)return;busy=true;try{const value=await query();if(alive)setData(value);}catch{if(alive)setData({status:'unavailable',windows:[],fetchedAt:Date.now()});}finally{busy=false;}};tick();const timer=setInterval(tick,60000);return()=>{alive=false;clearInterval(timer);};},[visible,query,nonce]);
    if(!visible)return null;
    const windows=data?.status==='ok'&&Array.isArray(data.windows)?data.windows:[];
    const worst=windows.length?Math.max(...windows.map(w=>w.usedPercent)):null;
    const summary=windows.length?windows.map(w=>`${w.label}: ${Math.round(w.usedPercent)}% used`).join(' · '):data?statusText[data.status]||'Quota unavailable':'Loading quota…';
    const buttonStyle={display:'inline-flex',alignItems:'center',gap:6,border:'1px solid currentColor',borderRadius:16,background:'transparent',color:'inherit',font:'inherit',fontSize:11,padding:'3px 8px',cursor:'pointer'};
    return h('div',{style:{position:'relative',display:'inline-flex',alignItems:'center',justifyContent:'center',maxWidth:'100%'}},h('button',{type:'button',style:buttonStyle,'aria-expanded':open,title:summary,onClick:()=>setOpen(x=>!x)},ring(worst),h('span',null,`Codex · ${summary}`)),open&&h('div',{role:'region','aria-label':'Codex subscription usage',style:{position:'absolute',bottom:'100%',right:0,width:250,zIndex:100,background:'var(--background, Canvas)',color:'var(--foreground, CanvasText)',border:'1px solid currentColor',borderRadius:10,padding:12,boxShadow:'0 4px 20px #0003',fontSize:12}},h('strong',null,'Codex subscription usage'),windows.length?windows.map(w=>h('div',{key:w.label,style:{marginTop:10}},h('div',null,`${w.label}: ${w.usedPercent.toFixed(1)}% used / ${(100-w.usedPercent).toFixed(1)}% left`),h('progress',{max:100,value:w.usedPercent,style:{width:'100%'},'aria-label':`${w.label} usage`}),h('div',null,displayReset(w.resetAt)))):h('p',null,summary),h('p',null,'Native Codex account quota, not token count. Data is cached for up to 60 seconds.'),h('button',{type:'button',style:buttonStyle,onClick:refresh},'Check quota'),h('button',{type:'button',style:{...buttonStyle,marginLeft:6},onClick:()=>setOpen(false)},'Close')));
  }
  function apply(ctx){
    const ready=ctx.remote.$mount(descriptor);
    const query=async()=>{await ready;const api=ctx.get('remote.safeCodexQuota');if(!api)throw new Error('Quota service unavailable');const result=await api.query();if(!result || result.ok!==true || !result.value)throw new Error('Quota unavailable');return result.value;};
    ctx.inject(['slots','modelDirectories','sessions','remote','remote.session'],scope=>{
      const models=scope.get('modelDirectories'),sessions=scope.sessions;
      for(const [seat,name,order] of [['hero','conversation.input.dock',5],['session','conversation.composer.dock',30]])scope.slots.inject(name,()=>scope.slots.register({name,id:'safe-codex-quota',order,inject:sessionId=>{
        let directory=null,available=false;try{available=sessions.subagentAddress(sessionId)===undefined;if(available)directory=models.directoryFor(sessionId);}catch{}
        return {seat,available,directory:directory?.store??null,load:()=>directory?.load().catch(()=>{}),query};
      }},Chip));
    });
  }
  return {inject,apply};
}});
