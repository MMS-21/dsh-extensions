import React,{createContext,useContext,useState} from 'react';
import {defineComponent} from '@openuidev/react-lang';
import {AnalyticsDashboard as Dashboard} from './vendor/obsidian/components/block/analytics-dashboard';
import {analyticsProps,statusProps,validateAnalyticsData} from './analytics-schema.js';
import {askAboutPullRequest} from './analytics-actions.js';

export const AnalyticsBridge=createContext(null);
export const AnalyticsDashboard=defineComponent({
  name:'AnalyticsDashboard',
  description:'Complete ObsidianUI engineering dashboard with Overview, searchable Repositories, filterable Code review, PR details and assistant. Use real Query-backed data matching the schema, or explicitly set mock=true for examples. Does not fetch GitHub by itself. answerTool optionally names an existing session tool accepting {question,pullRequest:{number,repository,title}} and returning {answer:string}; without it, questions draft into the source chat for review and Send. Settings only changes local appearance. Use standard library, not library=dashboard.',
  props:analyticsProps,
  component:({props})=>{
    const bridge=useContext(AnalyticsBridge);
    const parsed=validateAnalyticsData(props.data);
    if(parsed.error)return <p role="alert">{parsed.error}</p>;
    return <div className={`dsh-analytics-block${bridge?.mode==='dark'?' dark':''}`}>
      {props.mock&&<p className="dsh-analytics-notice">Example data · not connected to a live service</p>}
      <div style={{height:props.height||760,minWidth:0}}>
        <Dashboard data={parsed.data} brand={{name:props.title}} user={{name:'Workspace',email:'',avatar:'',role:'Dashboard view'}} variant="fill" defaultPage={props.defaultPage||'overview'} assistantName={props.answerTool?'Agent':'Source chat'}
          onAsk={(question,pr)=>askAboutPullRequest(bridge,props.answerTool,question,pr)}/>
      </div>
    </div>;
  },
});

const statusLabels={up:'Operational',degraded:'Degraded',down:'Outage',none:'No data'};
export const StatusBars=defineComponent({
  name:'StatusBars',
  description:'Accessible service or job status history inspired by ObsidianUI Status Bars. One supplied day per bar, up to 90. Missing observations must be status=none; never invent uptime. No synthetic success rates. Use Query-backed data for monitoring and mock=true for examples. Arrow keys navigate observations; hover/focus reveals the date, status and description.',
  props:statusProps,
  component:({props})=>{
    const [selected,setSelected]=useState(null);
    const checked=statusProps.safeParse(props);
    if(!checked.success)return <p role="alert">Status history needs valid observations, up to 90 days.</p>;
    const days=checked.data.days;
    const day=days[selected]||days.at(-1);
    return <section className="dsh-status-history" aria-label={props.label}>
      <header><strong>{props.label}</strong><span>{day?statusLabels[day.status]:'No data'}</span></header>
      {props.mock&&<p>Example data</p>}
      <div className="dsh-status-bars" role="group" aria-label="Daily status">
        {days.map((entry,index)=><button type="button" key={entry.date+'-'+index} data-status={entry.status} aria-label={`${entry.date}: ${statusLabels[entry.status]}${entry.description?'. '+entry.description:''}`} aria-pressed={selected===index}
          onFocus={()=>setSelected(index)} onMouseEnter={()=>setSelected(index)} onClick={()=>setSelected(index)}
          onKeyDown={event=>{const offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;if(offset){event.preventDefault();event.currentTarget.parentElement.children[Math.max(0,Math.min(days.length-1,index+offset))]?.focus();}}}/>)}
      </div>
      <p className="dsh-status-detail" aria-live="polite">{day?`${day.date} · ${statusLabels[day.status]}${day.description?' · '+day.description:''}`:'No observations supplied.'}</p>
    </section>;
  },
});
