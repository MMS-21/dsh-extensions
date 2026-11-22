import {appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {join} from 'node:path';

export const DESIGN_SKILLS = Object.freeze(['analysis-report-workflow','dashboard-design-process','dashboard-design-patterns','dashboard-design-review']);
const limit = 2_000_000;
const key = value => createHash('sha256').update(value).digest('hex');
export class TaskStore {
  constructor(directory) { this.directory=directory; }
  folder(session) {
    if(typeof session!=='string'||!session||session.length>500)throw Error('Invalid task session');
    return join(this.directory,key(session));
  }
  read(session) {
    const file=join(this.folder(session),'context.json');
    if(!existsSync(file))return null;
    const bytes=readFileSync(file);
    if(bytes.length>limit)throw Error('Task context exceeds its budget');
    let envelope;try{envelope=JSON.parse(bytes);}catch{throw Error('Task context is corrupt; preserve it for recovery');}
    if(envelope.version!==1||envelope.sessionHash!==key(session)||key(JSON.stringify(envelope.task))!==envelope.sha256)throw Error('Task context integrity check failed');
    return envelope.task;
  }
  write(session,task) {
    const folder=this.folder(session);mkdirSync(folder,{recursive:true});
    const data=JSON.stringify({version:1,sessionHash:key(session),sha256:key(JSON.stringify(task)),task},null,2)+'\n';
    if(Buffer.byteLength(data)>limit)throw Error('Task context exceeds its budget');
    const temporary=join(folder,`.context-${randomUUID()}.tmp`);
    let fd;
    try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,data);fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,join(folder,'context.json'));}
    finally{if(fd!==undefined)closeSync(fd);if(existsSync(temporary))unlinkSync(temporary);}
    return task;
  }
  event(session,event) {
    const folder=this.folder(session);mkdirSync(folder,{recursive:true});
    // Journal contains bounded stage/outcome identifiers, never raw tool payloads or queries.
    const value={at:new Date().toISOString(),taskId:event.taskId,operationId:event.operationId,stage:event.stage,outcome:event.outcome,code:event.code};
    const file=join(folder,'operations.jsonl');let fd;
    try{fd=openSync(file,'a',0o600);writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}finally{if(fd!==undefined)closeSync(fd);}
  }
  async exclusive(session,work) {
    const folder=this.folder(session);mkdirSync(folder,{recursive:true});
    const file=join(folder,'execution.lock');let fd;
    try{fd=openSync(file,'wx',0o600);}catch(error){
      if(error.code!=='EEXIST')throw error;
      let owner;try{owner=JSON.parse(readFileSync(file,'utf8'));}catch{}
      let dead=false;
      if(Number.isInteger(owner?.pid)&&owner.pid>0){try{process.kill(owner.pid,0);}catch(probe){dead=probe.code==='ESRCH';}}
      // Recover the abandoned mutex, never the operation. Dispatching/unknown steps
      // still require authoritative backend reconciliation in Workflow.execute.
      if(dead){unlinkSync(file);fd=openSync(file,'wx',0o600);}
      else throw Object.assign(Error('Task execution is active or was interrupted. Inspect task state before recovery; no writes were repeated.'),{code:'TASK_LOCKED'});
    }
    try{writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));fsyncSync(fd);return await work();}
    finally{closeSync(fd);unlinkSync(file);}
  }
  paths(session){const folder=this.folder(session);return {context:join(folder,'context.json'),journal:join(folder,'operations.jsonl')};}
}
