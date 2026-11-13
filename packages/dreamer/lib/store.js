import {z} from 'zod';
import {blank} from './model.js';
export async function openStore(ctx){
  const domain=await ctx.storageDomain.open({name:'dreamer',version:1,tables:{state:{valueSchema:z.unknown()}}});
  const table=domain.table('state');
  const saved=await table.get('journal');
  let state={...blank(),...(saved||{})};
  if(saved&&!Object.hasOwn(saved,'totalDreams'))state.totalDreams=state.dreams?.length||0;
  if(state.version!==1||!Array.isArray(state.dreams)||!Array.isArray(state.observations))throw Error('Invalid Dreamer journal; refusing to overwrite it');
  let queue=Promise.resolve();
  return {read:()=>structuredClone(state),flush:()=>queue,
    mutate(update){const job=queue.then(async()=>{const next=update(structuredClone(state));await table.put('journal',next);state=next;return structuredClone(next);});queue=job.catch(()=>{});return job;},
    async close(){await queue;await domain.close();}};
}
