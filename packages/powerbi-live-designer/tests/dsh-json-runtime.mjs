// Qualify against the exact validator shipped in a local DSH archive, without editing it.
// Usage: node tests/dsh-json-runtime.mjs <path-to-resources/app.asar>
import assert from 'node:assert/strict';
import {openSync,readSync,closeSync,mkdirSync,writeFileSync,mkdtempSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {TaskStore} from '../task-store.mjs';
import {Workflow} from '../workflow.mjs';
import {jsonTool} from '../tool-json.mjs';
const archive=process.argv[2]??process.env.DSH_ASAR_PATH;
if(!archive)throw Error('Supply the installed DSH resources/app.asar path.');
const directory=mkdtempSync(join(tmpdir(),'pbi-dsh-json-runtime-'));
try{
 const fd=openSync(archive,'r');
 try{
  const header=Buffer.alloc(16);readSync(fd,header,0,16,0);
  const bytes=Buffer.alloc(header.readUInt32LE(12));readSync(fd,bytes,0,bytes.length,16);
  const tree=JSON.parse(bytes.toString('utf8'));let pkg=tree;
  for(const key of ['dsh','node_modules','@deepseek-ai','dsh-util-values'])pkg=pkg.files[key];
  function extract(files,path){for(const [name,entry] of Object.entries(files)){
   const target=join(path,name);
   if(entry.files){extract(entry.files,target);continue;}
   if(entry.unpacked||!(name.endsWith('.js')||name==='package.json'))continue;
   const data=Buffer.alloc(entry.size);readSync(fd,data,0,data.length,8+header.readUInt32LE(4)+Number(entry.offset));mkdirSync(path,{recursive:true});writeFileSync(target,data);
  }}
  extract(pkg.files,join(directory,'native'));
 }finally{closeSync(fd);}
 const {snapshotJsonValue}=await import(pathToFileURL(join(directory,'native/lib/index.js')).href);
 // This is the previous task status shape: native DSH rejects it before render().
 assert.equal(snapshotJsonValue({ok:true,task:{phase:'prepared',blocker:undefined,steps:{apply:{outcome:'succeeded',code:undefined}}}}),undefined);
 const verify=value=>{assert.notEqual(snapshotJsonValue(value),undefined);assert.deepEqual(snapshotJsonValue(value),value);};
 const project=join(directory,'Fixture.pbip'),image=join(directory,'page.png');writeFileSync(image,'fixture');
 const {createHash}=await import('node:crypto');const sha256=createHash('sha256').update('fixture').digest('hex');
 let applied=false,reloaded=false;
 const change={id:'a'.repeat(32),digest:'b'.repeat(64)};
 const adapter={normalize:x=>x,prepare:async()=>({project,capabilities:{desktop:true},connection:{}}),bind:async()=>{},inspect:async()=>({ok:true,model:{tables:[],optional:undefined}}),plan:async()=>({id:'plan'}),stage:async()=>change,validate:async()=>({status:'validated'}),get:async()=>({...change,status:applied?'applied':'approved',approval:{digest:change.digest,source:'native-user-command'},reloadOutcome:reloaded?'succeeded':undefined}),apply:async()=>{applied=true;return {status:'applied'};},reload:async()=>{reloaded=true;return {reloadOutcome:'succeeded'};},snapshot:async()=> 'snapshot',query:async()=>({passed:true,actual:1,expected:1}),capture:async()=>({rendererAcknowledged:true,path:image,sha256}),readiness:async()=>({checks:{desktopAccessible:true,unsavedChanges:false}})};
 const workflow=new Workflow(new TaskStore(join(directory,'tasks')),adapter);
 const run=async execute=>{const value=await jsonTool({execute}).execute();verify(value);return value;};
 await run(()=>workflow.status('fixture'));
 await run(()=>workflow.prepare('fixture',{project,intent:'Verify native JSON contract'}));
 // Avoid a live resume: we qualify persisted task outputs, not Desktop discovery.
 await run(()=>workflow.inspect('fixture'));
 await run(()=>workflow.draft('fixture',{plan:{},changes:{files:[]},pages:['pageA'],acceptance:['Fixture number is one'],checks:[{query:'EVALUATE ROW("n",1)',expected:1}]}));
 await run(()=>workflow.execute('fixture'));
 await run(()=>workflow.finish('fixture',[{page:'pageA',sha256,passed:true,notes:'Serialization fixture, not live visual acceptance.'}]));
 await run(()=>workflow.status('fixture'));
 console.log('PASS installed DSH validator: old undefined fields reproduce the failure; empty, prepared, inspected, staged, executed, finished and resumed status results all survive the native snapshot.');
}finally{await rm(directory,{recursive:true,force:true});}
