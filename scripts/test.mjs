import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const npmCli=process.env.npm_execpath;
if(!npmCli)throw Error('Run this script through npm test.');
for(const [directory,args] of [['render-ui',['run','build']],['render-ui',['test']],['whiteboard',['test']],['dreamer',['test']]]){
  const cwd=fileURLToPath(new URL(`../packages/${directory}/`,import.meta.url));
  const result=spawnSync(process.execPath,[npmCli,...args],{cwd,stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}

