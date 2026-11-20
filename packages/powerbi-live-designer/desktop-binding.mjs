// Bind Desktop's exact current PBIP path to its Analysis Services child process.
import {existsSync} from 'node:fs';
import {join,win32} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const normalized=path=>win32.resolve(path).toLowerCase();
export function selectInstance(project,instances,desktopStatus,processes) {
  const matches=(desktopStatus.instances??[]).filter(item=>item.bridgeStatus==='connected' && typeof item.currentFilePath==='string' && normalized(item.currentFilePath)===normalized(project));
  if(matches.length!==1)throw Object.assign(new Error('Open exactly one instance of the requested PBIP path; window titles are not project identity'),{code:'DESKTOP_PROJECT_MISMATCH'});
  const desktopPid=matches[0].pid;
  const parents=new Map(processes.map(item=>[item.ProcessId,item.ParentProcessId]));
  const bound=instances.filter(instance=>{
    if(instance.parentProcessName!=='PBIDesktop')return false;
    let cursor=instance.processId;
    for(let depth=0;depth<12;depth++) {
      cursor=parents.get(cursor);
      if(cursor===desktopPid)return true;
      if(!cursor)return false;
    }
    return false;
  });
  if(bound.length!==1)throw Object.assign(new Error('Cannot bind one semantic-model process to the exact Desktop project'),{code:'MODEL_PROCESS_MISMATCH'});
  return bound[0];
}
export async function resolveDesktopInstance(project,instances) {
  const candidate=process.env.PBI_DESKTOP_BRIDGE_MODULE || join(process.env.APPDATA??'','npm/node_modules/@microsoft/powerbi-report-authoring-cli/node_modules/@microsoft/powerbi-desktop-bridge-cli/dist/index.js');
  if(!existsSync(candidate))throw Object.assign(new Error('Install the report-authoring CLI Desktop Bridge dependency or configure PBI_DESKTOP_BRIDGE_MODULE'),{code:'DESKTOP_BRIDGE_UNAVAILABLE'});
  const {readDesktopStatus}=await import(pathToFileURL(candidate).href);
  const status=await readDesktopStatus();
  const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'],{windowsHide:true,timeout:15000,maxBuffer:2000000});
  const processes=JSON.parse(stdout);
  return selectInstance(project,instances,status,Array.isArray(processes)?processes:[processes]);
}
