// Read-only account quota UI. Credentials and HTTP requests stay on the host.
window.__ModuleLoader__.load({id:'dsh-codex-oauth-safe',factory(require){
  const React=require('react'),h=React.createElement;
  const descriptor={package:'dsh-codex-oauth-safe',descriptors:[{id:'dsh-codex-oauth-safe#safeCodexQuota/query',service:'safeCodexQuota',namespace:'safeCodexQuota',method:'query',invocation:{kind:'direct'},parameters:[],result:{mode:'strict',typeSymbol:'dsh-codex-oauth-safe#Quota',create:()=>({parse:v=>v}),decode:v=>v,encode:v=>v}}]};
  const messages={'signed-out':'Sign in to ChatGPT in Settings → Models','expired':'ChatGPT sign-in needs refreshing','vault-locked':'Native credential store unavailable','rate-limited':'Quota service rate limited','unavailable':'Quota unavailable; not zero usage'};
  function Usage({query}){
    const [data,setData]=React.useState(null),[busy,setBusy]=React.useState(false),[open,setOpen]=React.useState(false);
    const button=React.useRef(null),panel=React.useRef(null),refreshRef=React.useRef(null),id=React.useId();
    React.useEffect(()=>{
      let live=true,pending=false;
      const refresh=async()=>{if(pending)return;pending=true;if(live)setBusy(true);try{const value=await query();if(live)setData(value);}catch(error){if(live)setData({status:'ui-error',detail:String(error?.message||error).slice(0,160),windows:[],fetchedAt:Date.now()});}finally{pending=false;if(live)setBusy(false);}};
      refreshRef.current=refresh;const tick=()=>{if(document.visibilityState!=='hidden')refresh();};
      tick();const timer=setInterval(tick,60000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);
      return()=>{live=false;refreshRef.current=null;clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};
    },[query]);
    const position=()=>{
      const node=panel.current,anchor=button.current;if(!node?.matches(':popover-open')||!anchor)return;
      const rect=anchor.getBoundingClientRect(),v=window.visualViewport,left=v?.offsetLeft??0,top=v?.offsetTop??0,width=v?.width??innerWidth,height=v?.height??innerHeight;
      node.style.maxHeight=Math.max(80,height-24)+'px';const size=node.getBoundingClientRect();
      node.style.left=Math.max(left+12,Math.min(rect.right+8,left+width-size.width-12))+'px';node.style.top=Math.max(top+12,Math.min(rect.bottom-size.height,top+height-size.height-12))+'px';
    };
    React.useEffect(()=>{
      const node=panel.current;const toggle=()=>{setOpen(node.matches(':popover-open'));position();};node.addEventListener('toggle',toggle);
      const observer=new ResizeObserver(position);observer.observe(node);window.addEventListener('resize',position);
      const dismiss=event=>{if(node.matches(':popover-open')&&!node.contains(event.target))node.hidePopover();};window.addEventListener('scroll',dismiss,true);
      return()=>{node.removeEventListener('toggle',toggle);observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',dismiss,true);};
    },[]);
    const windows=data?.status==='ok'&&Array.isArray(data.windows)?data.windows.filter(w=>Number.isFinite(w.usedPercent)&&w.usedPercent>=0&&w.usedPercent<=100):[];
    const used=windows.length?Math.max(...windows.map(w=>w.usedPercent)):null;
    const summary=windows.length?windows.map(w=>`${w.label}: ${w.usedPercent.toFixed(1)}% used`).join(' · '):data?data.status==='ui-error'?'Quota display error: '+data.detail:(messages[data.status]??messages.unavailable):'Loading subscription usage…';
    return h('div',{className:'safe-quota-rail'},
      h('button',{ref:button,type:'button',className:'safe-quota-trigger',popovertarget:id,popovertargetaction:'toggle','aria-label':`Codex subscription usage: ${summary}`,'aria-haspopup':'dialog','aria-expanded':open,title:summary,onClick:()=>requestAnimationFrame(position)},
        h('svg',{viewBox:'0 0 36 36',width:32,height:32,'aria-hidden':true},h('circle',{cx:18,cy:18,r:15,fill:'none',stroke:'currentColor',strokeWidth:2,opacity:.2}),used===null?null:h('circle',{cx:18,cy:18,r:15,fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',pathLength:100,strokeDasharray:`${used} 100`,transform:'rotate(-90 18 18)'}),h('text',{x:18,y:21,textAnchor:'middle',fill:'currentColor',fontSize:used===null?12:8,fontFamily:'system-ui'},used===null?'?':`${Math.round(used)}%`))),
      h('div',{ref:panel,id,popover:'auto',role:'dialog','aria-label':'Codex subscription usage',className:'safe-quota-panel',onKeyDown:event=>{if(event.key==='Escape'){panel.current.hidePopover();button.current.focus();}}},h('strong',null,'Codex subscription usage'),
        windows.length?windows.map(w=>h('section',{key:w.label},h('div',{className:'safe-quota-window'},h('span',null,w.label),h('span',null,`${w.usedPercent.toFixed(1)}% used`)),h('progress',{max:100,value:w.usedPercent,'aria-label':`${w.label} usage`}),h('small',null,`${(100-w.usedPercent).toFixed(1)}% remaining · `,w.resetAt?`Resets ${new Date(w.resetAt).toLocaleString()}`:'Reset time unavailable'))):h('p',{role:'status'},summary),
        h('p',{className:'safe-quota-note'},'Account quota · refreshes every 60 seconds while visible.'),data?.fetchedAt?h('small',null,`Last checked ${new Date(data.fetchedAt).toLocaleTimeString()}`):null,
        h('div',{className:'safe-quota-actions'},h('button',{type:'button',disabled:busy,onClick:()=>refreshRef.current?.()},busy?'Checking…':'Check quota'),h('button',{type:'button',onClick:()=>{panel.current.hidePopover();button.current.focus();}},'Close'))));
  }
  return{inject:['slots','remote'],apply(ctx){
    const ready=ctx.remote.$mount(descriptor);
    const query=async()=>{await ready;const api=ctx.get('remote.safeCodexQuota');if(!api)throw Error('Quota remote service missing');const result=await api.query();if(result?.ok!==true)throw Error(result?.error?.message||'Quota request rejected');if(!result.value)throw Error('Quota response missing');return result.value;};
    const style=document.createElement('style');style.textContent=`
.safe-quota-rail{display:inline-flex;align-items:center;justify-content:center}
.safe-quota-trigger{display:grid;place-items:center;width:40px;height:40px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-primary,CanvasText);cursor:pointer}
.safe-quota-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.safe-quota-panel{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:300px;max-width:calc(100vw - 24px);overflow:auto;padding:16px;border:0;border-radius:16px;background:var(--dsw-alias-bg-layer-2,Canvas);color:var(--dsw-alias-label-primary,CanvasText);box-shadow:0 8px 32px #0004;font:13px/1.5 system-ui}
.safe-quota-panel section{margin-top:14px}.safe-quota-window{display:flex;justify-content:space-between;gap:12px}.safe-quota-panel progress{width:100%;height:6px;accent-color:currentColor}.safe-quota-panel small,.safe-quota-note{color:var(--dsw-alias-label-secondary,GrayText)}.safe-quota-actions{display:flex;gap:8px;margin-top:14px}.safe-quota-actions button{border:0;border-radius:8px;padding:7px 10px;background:var(--dsw-alias-interactive-bg-hover,#8882);color:inherit;font:inherit;cursor:pointer}.safe-quota-actions button:disabled{opacity:.5;cursor:wait}.safe-quota-trigger:focus-visible,.safe-quota-actions button:focus-visible{outline:2px solid var(--dsw-focus-ring-color,Highlight);outline-offset:-2px}
`;document.head.appendChild(style);ctx.effect(()=>()=>style.remove());
    ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'safe-codex-quota-rail',order:100,inject:()=>({query})},Usage));
  }};
}});
