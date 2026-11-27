import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {parseQuota,emptyQuota} from './quota-core.mjs';

// Query the installed Codex app-server. Only normalized quota metadata escapes.
export async function readCodexAppQuota(_expectedAccountId, {spawnProcess=spawn, timeoutMs=12000}={}) {
  return new Promise(resolve=>{
    let done=false, buffer='', timer;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);child.kill();resolve(value);};
    let child;
    const installed = process.platform === 'win32' && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA,'Programs','OpenAI','Codex','bin','codex.exe') : null;
    const executable = installed && existsSync(installed) ? installed : 'codex';
    try {child=spawnProcess(executable,['app-server','--listen','stdio://'],{stdio:['pipe','pipe','ignore'],windowsHide:true});}
    catch {resolve(emptyQuota('unavailable'));return;}
    timer=setTimeout(()=>finish(emptyQuota('unavailable')),timeoutMs);
    child.on('error',()=>finish(emptyQuota('unavailable')));
    child.on('exit',()=>finish(emptyQuota('unavailable')));
    child.stdout.on('data',chunk=>{
      buffer+=chunk.toString();if(buffer.length>262144)return finish(emptyQuota('unavailable'));
      for(let index;(index=buffer.indexOf('\n'))>=0;){
        const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
        let message;try{message=JSON.parse(line);}catch{continue;}
        if(message.id!==2)continue;
        const result=message.result;
        return finish(parseQuota({rateLimits:result?.rateLimitsByLimitId?.codex ?? result?.rateLimits}));
      }
    });
    for(const msg of [{id:1,method:'initialize',params:{clientInfo:{name:'dsh-quota',version:'1.0.0'},capabilities:{}}},{method:'initialized',params:{}},{id:2,method:'account/rateLimits/read',params:{}}])child.stdin.write(JSON.stringify(msg)+'\n');
  });
}
