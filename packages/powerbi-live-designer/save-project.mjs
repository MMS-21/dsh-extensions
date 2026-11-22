import {readDesktopStatus} from '@microsoft/powerbi-desktop-bridge-cli';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {win32} from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectSnapshot} from './project-snapshot.mjs';
const execute=promisify(execFile);
const normalize=value=>win32.resolve(value).toLowerCase();
function exactInstance(project,status){
  const instances=(status.instances??[]).filter(i=>i.bridgeStatus==='connected'&&typeof i.currentFilePath==='string'&&normalize(i.currentFilePath)===normalize(project));
  if(instances.length!==1||!Number.isInteger(instances[0].pid)||typeof instances[0].hasUnsavedChanges!=='boolean')throw Object.assign(Error('Save requires one exact, connected Desktop project with a known saved state.'),{code:'SAVE_TARGET_UNVERIFIED'});
  return instances[0];
}
export async function saveCapability(executeCommand=execute){
  try{const {stdout}=await executeCommand('python',['-B',fileURLToPath(new URL('./py-service/desktop_save.py',import.meta.url)),'--probe'],{windowsHide:true,timeout:15000});return JSON.parse(stdout).available===true;}catch{return false;}
}
export async function saveVerifiedProject(project,expectedSnapshot,{status=readDesktopStatus,snapshot=projectSnapshot,submit,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  if(snapshot(project)!==expectedSnapshot)throw Object.assign(Error('Definitions changed after review; saving stopped.'),{code:'SAVE_DEFINITIONS_CHANGED'});
  const before=exactInstance(project,await status());
  if(!before.hasUnsavedChanges)return {saved:true,alreadySaved:true,pid:before.pid,snapshot:snapshot(project)};
  const send=submit??(async pid=>{
    await execute('python',['-B',fileURLToPath(new URL('./py-service/desktop_save.py',import.meta.url)),'--pid',String(pid)],{windowsHide:true,timeout:30000});
  });
  // Recheck identity and disk immediately before the exact-PID input. Never reload.
  const current=exactInstance(project,await status());
  if(current.pid!==before.pid||snapshot(project)!==expectedSnapshot)throw Object.assign(Error('The save target changed before dispatch.'),{code:'SAVE_TARGET_CHANGED'});
  await send(before.pid);
  for(let attempt=0;attempt<20;attempt++){
    const after=exactInstance(project,await status());
    if(after.pid!==before.pid)throw Object.assign(Error('Desktop identity changed during save; outcome is unknown.'),{code:'SAVE_OUTCOME_UNKNOWN'});
    if(after.hasUnsavedChanges===false)return {saved:true,pid:after.pid,snapshot:snapshot(project)};
    await wait(250);
  }
  throw Object.assign(Error('Desktop did not confirm saved state. Inspect it before retrying; no reload was performed.'),{code:'SAVE_OUTCOME_UNKNOWN'});
}
