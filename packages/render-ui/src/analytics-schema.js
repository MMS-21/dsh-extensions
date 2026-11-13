import {z} from 'zod';
const text=(n=200)=>z.string().max(n);
const id=text(120).min(1);
const count=z.number().int().min(0).max(1e12);
const color=z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
const avatar=z.string().max(2048).regex(/^(https?:\/\/[^\s]+)?$/).optional();
const series=z.array(z.number().min(0).max(1e12)).max(366);
export const analyticsDataSchema=z.object({
  people:z.array(z.object({handle:id,avatar,color,role:text().optional()})).max(100),
  ranges:z.array(z.object({id,label:text(60),caption:text()})).min(1).max(12),
  kpis:z.record(id,z.array(z.object({id,label:text(100),icon:z.enum(['commit','pull','merge','clock']),value:text(40),delta:z.number().min(-1e6).max(1e6),lowerIsBetter:z.boolean().optional(),spark:series})).max(8)),
  activity:z.record(id,z.object({labels:z.array(text(60)).max(366),series:z.record(id,series),lines:z.record(id,z.object({added:count,removed:count}))})),
  repositories:z.array(z.object({name:id,description:text(1000),language:text(60),languageColor:color,visibility:z.enum(['Private','Public']),openPrs:count,stars:count,updated:text(100),updatedMinutes:count,activity:series})).max(200),
  pullRequests:z.array(z.object({number:z.number().int().min(1).max(1e9),title:text(300),author:id,status:z.object({kind:z.enum(['merged','review','open']),label:text(80)}),repository:id,opened:text(100),age:text(60),today:z.boolean(),additions:count,deletions:count,comments:count,problem:z.array(text(3000)).max(12),approach:z.array(text(3000)).max(12)})).max(200),
});
export const analyticsProps=z.object({
  title:text(120).min(1),
  data:analyticsDataSchema,
  answerTool:z.string().max(120).regex(/^[A-Za-z0-9_.-]+$/).optional(),
  defaultPage:z.enum(['overview','repositories','reviews','settings']).optional(),
  height:z.number().int().min(480).max(1200).optional(),
  mock:z.boolean().optional(),
});
export const statusDaySchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),status:z.enum(['up','degraded','down','none']),description:text(500).optional()});
export const statusProps=z.object({label:text(120).min(1),days:z.array(statusDaySchema).max(90),mock:z.boolean().optional()});

export function validateAnalyticsData(value){
  const result=analyticsDataSchema.safeParse(value);
  if(!result.success)return {error:'Dashboard data is incomplete or exceeds its limits.'};
  const data=result.data;
  const handles=new Set(data.people.map(person=>person.handle));
  if(handles.size!==data.people.length || new Set(data.ranges.map(range=>range.id)).size!==data.ranges.length || new Set(data.pullRequests.map(pr=>pr.number)).size!==data.pullRequests.length)return {error:'People, ranges and pull requests need unique identifiers.'};
  if(data.pullRequests.some(pr=>!handles.has(pr.author)))return {error:'Every pull request author must appear in people.'};
  for(const activity of Object.values(data.activity)){
    if(Object.entries(activity.series).some(([handle,values])=>!handles.has(handle)||values.length!==activity.labels.length))return {error:'Activity series must match their labels and known people.'};
  }
  return {data};
}
