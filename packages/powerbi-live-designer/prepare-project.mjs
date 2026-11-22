import {existsSync,mkdirSync,openSync,closeSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join,resolve,win32} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {saveCapability} from './save-project.mjs';
const execute=promisify(execFile);
const bundle=fileURLToPath(new URL('.',import.meta.url));
const fail=(message,code)=>Object.assign(Error(message),{code});
// The Desktop host runs this plugin inside Electron's node mode, where process.execPath is the
// Electron executable and commander-based CLIs mis-detect the runtime. Prefer a real Node binary.
function nodeExecutable(){
  if(!process.versions?.electron)return process.execPath;
  const candidates=[process.env.PBI_NODE_EXE,process.env.DSH_NODE_EXE,
    join(process.env.DSH_HOME??'','dsh-runtimes','dsh-primary-runtime','dependencies','node','bin','node.exe'),
    join(process.env.DSH_INSTALL_DIR??'','..','..','..','..','..','runtime','primary-runtime','dependencies','node','bin','node.exe'),
    join(process.env.ProgramFiles??'','nodejs','node.exe')].filter(Boolean);
  return candidates.find(existsSync)??process.execPath;
}
export async function discoverDesktop(executeCommand=execute){
  if(process.platform!=='win32')return null;
  if(process.env.PBI_DESKTOP_PATH&&existsSync(process.env.PBI_DESKTOP_PATH))return process.env.PBI_DESKTOP_PATH;
  // Store and standalone installs; no registry changes, downloads, UI control or guessed titles.
  const script="$paths=@(); $paths+=@(Get-Process PBIDesktop -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path); $paths+=@(Get-AppxPackage Microsoft.MicrosoftPowerBIDesktop -ErrorAction SilentlyContinue | ForEach-Object {Join-Path $_.InstallLocation 'bin\\PBIDesktop.exe'}); $paths+=@((Join-Path $env:ProgramFiles 'Microsoft Power BI Desktop\\bin\\PBIDesktop.exe'),(Join-Path $env:ProgramFiles 'Microsoft Power BI Desktop RS\\bin\\PBIDesktop.exe')); $paths | Where-Object {$_ -and (Test-Path -LiteralPath $_ -PathType Leaf)} | Select-Object -First 1 | ConvertTo-Json -Compress";
  const {stdout}=await executeCommand('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:15000});
  return stdout.trim()?JSON.parse(stdout):null;
}
async function freePort(){const server=createServer();await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});const port=server.address().port;await new Promise(yes=>server.close(yes));return port;}
export async function ensureDesktopProject(project,cli,desktop,executeCommand=execute,allowUnsaved=false){
  const options={windowsHide:true,timeout:60000,maxBuffer:2_000_000,env:{...process.env,PBI_DESKTOP_PATH:desktop}};
  async function command(flags){
    try{const result=await executeCommand(nodeExecutable(),[cli,'preview',project,'--host','desktop',...flags],options);return JSON.parse(result.stdout);}
    catch(error){if(error.stdout){try{return JSON.parse(error.stdout);}catch{}}throw fail('Desktop operation did not return a complete result. Inspect Desktop before retrying.','DESKTOP_OUTCOME_UNKNOWN');}
  }
  const status=await command(['--status']);
  if(status.error?.code==='HOST_UNAVAILABLE'){
    if(status.error.details?.candidatePids?.length>1)throw fail('Several Desktop instances hold this project. Select one before continuing.','PROJECT_AMBIGUOUS');
    // The status preflight establishes no matching live state to overwrite.
    const opened=await command([]);
    if(opened.error||opened.ok===false||opened.data?.ok===false)throw fail('Desktop could not open this project. Inspect it before retrying.',opened.error?.code??'DESKTOP_OPEN_FAILED');
    return;
  }
  if(status.error)throw fail('Desktop status could not establish safe project readiness.',status.error.code);
  const dirty=status.data?.details?.hasUnsavedChanges;
  if(dirty!==false&&!(allowUnsaved&&dirty===true))throw fail('Save or resolve unsaved edits in the exact report before continuing.','DESKTOP_UNSAVED_CHANGES');
}
export async function prepareProject(input,{directory=bundle,executeCommand=execute,platform=process.platform}={}){
  if(platform!=='win32')throw fail('Local Power BI Desktop authoring requires Windows.','HOST_UNSUPPORTED');
  const manifestPath=join(directory,'node_modules/@microsoft/powerbi-report-authoring-cli/package.json');
  if(!existsSync(manifestPath))throw fail('The bundled authoring CLI is missing. Run the plugin installer before preparing reports.','AUTHORING_CLI_MISSING');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const expected=JSON.parse(readFileSync(join(directory,'package.json'),'utf8')).dependencies['@microsoft/powerbi-report-authoring-cli'];
  if(manifest.version!==expected)throw fail(`The bundled authoring CLI must be ${expected}. Run the plugin installer.`, 'AUTHORING_CLI_VERSION');
  const cli=resolve(directory,'node_modules/@microsoft/powerbi-report-authoring-cli',manifest.bin['powerbi-report-author']);
  const desktop=await discoverDesktop(executeCommand);
  if(!desktop)throw fail('Install Power BI Desktop or configure PBI_DESKTOP_PATH.','DESKTOP_UNAVAILABLE');
  let project=input.project;
  if(!project&&input.mode==='new'){
    if(!input.outputDirectory||!win32.isAbsolute(input.outputDirectory)||!input.reportName||!/^[-\w ]{1,80}$/.test(input.reportName))throw fail('For a new report provide an absolute outputDirectory and a reportName containing letters, numbers, spaces, hyphens or underscores.','OUTPUT_REQUIRED');
    const {stdout}=await executeCommand(nodeExecutable(),[cli,'scaffold',input.outputDirectory,'--name',input.reportName,'--offline'],{windowsHide:true,timeout:60000,maxBuffer:2_000_000});
    const result=JSON.parse(stdout);project=result.data?.pbipPath;
    if(!project)throw fail('Project scaffold did not return an owning PBIP path.','SCAFFOLD_FAILED');
    // The CLI scaffolds the report shell only. Create an empty local-model shell;
    // the agent stages the actual source queries, tables, measures and relationships for review.
    const model=join(input.outputDirectory,input.reportName+'.SemanticModel');
    mkdirSync(join(model,'definition'),{recursive:true});
    writeFileSync(join(model,'definition.pbism'),JSON.stringify({version:'4.2',settings:{}},null,2),{flag:'wx'});
    writeFileSync(join(model,'definition/database.tmdl'),`database ${randomUUID()}\n\tcompatibilityLevel: 1702\n`,{flag:'wx'});
    writeFileSync(join(model,'definition/model.tmdl'),'model Model\n\tculture: en-US\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n\tsourceQueryCulture: en-US\n',{flag:'wx'});
  }
  if(!project){
    const bridge=await import('@microsoft/powerbi-desktop-bridge-cli');
    const status=await bridge.readDesktopStatus();
    const paths=[...new Set((status.instances??[]).filter(x=>x.bridgeStatus==='connected'&&/\.pbip$/i.test(x.currentFilePath??'')).map(x=>win32.normalize(x.currentFilePath)))];
    if(paths.length!==1)throw fail('Choose the exact PBIP project: no unique open project was found.','PROJECT_AMBIGUOUS');
    project=paths[0];
  }
  if(!win32.isAbsolute(project)||!/\.pbip$/i.test(project)||!existsSync(project))throw fail('Choose an existing absolute PBIP path. Preserve PBIX files and save a separate project copy.','PROJECT_REQUIRED');
  await ensureDesktopProject(project,cli,desktop,executeCommand,input.resume===true);
  const runtime=join(directory,'.runtime');mkdirSync(runtime,{recursive:true});
  const projectKey=createHash('sha256').update(win32.normalize(project).toLowerCase()).digest('hex');
  const startupLock=join(runtime,`prepare-${projectKey}.lock`);let lock;
  try{lock=openSync(startupLock,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw fail('Project preparation is active or was interrupted; inspect the coordinator before retrying.','PREPARATION_LOCKED');throw error;}
  try {
  const connectionFile=join(runtime,`connection-${projectKey}.json`);
  if(existsSync(connectionFile)){
    const saved=JSON.parse(readFileSync(connectionFile,'utf8'));
    const origin=new URL(saved.serviceUrl);
    if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||origin.pathname!=='/'||origin.username||origin.password||origin.search||origin.hash)throw fail('Invalid saved coordinator origin.','CONNECTION_INVALID');
    try{
      const response=await fetch(saved.serviceUrl+'/api/state',{signal:AbortSignal.timeout(1000),redirect:'error'});const payload=await response.json();
      if(saved.protocol==='task-tools-v2'&&win32.normalize(payload.state?.project??'').toLowerCase()===win32.normalize(project).toLowerCase())return {project,connection:{protocol:'task-tools-v2',serviceUrl:saved.serviceUrl,controlTokenFile:join(runtime,'control-token')},capabilities:{...saved.capabilities,automaticSave:await saveCapability(executeCommand)}};
    }catch{}
  }
  const tokenFile=join(runtime,'control-token');
  if(!existsSync(tokenFile))writeFileSync(tokenFile,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
  const modeling=[process.env.PBI_MODELING_MCP_EXE,join(directory,'node_modules/@microsoft/powerbi-modeling-mcp-win32-x64/dist/powerbi-modeling-mcp.exe')].find(x=>x&&existsSync(x));
  const port=await freePort();const serviceUrl=`http://127.0.0.1:${port}`;
  const stdout=openSync(join(runtime,`coordinator-${port}.stdout.log`),'a');const stderr=openSync(join(runtime,`coordinator-${port}.stderr.log`),'a');
  let child;
  try{child=spawn('python',['-B',join(directory,'py-service/server.py'),'--project',project,'--port',String(port),'--control-token-file',tokenFile,'--cli',cli,...(modeling?['--modeling-server',modeling]:[])],{windowsHide:true,stdio:['ignore',stdout,stderr],env:{...process.env,PBI_DESKTOP_PATH:desktop}});}finally{closeSync(stdout);closeSync(stderr);}
  let launchError;child.on('error',error=>{launchError=error;});child.unref();
  for(let attempt=0;attempt<40;attempt++){
    if(launchError||child.exitCode!==null)throw fail('Coordinator could not start. Check the local coordinator diagnostic log.','COORDINATOR_FAILED');
    try{
      const response=await fetch(serviceUrl+'/api/state',{signal:AbortSignal.timeout(1000),redirect:'error'});const payload=await response.json();
      if(win32.normalize(payload.state?.project??'').toLowerCase()===win32.normalize(project).toLowerCase()){
        const capabilities={localProject:true,desktop:true,modeling:!!modeling,reportAuthoring:true,sourceImport:'agent-authored TMDL required',remoteFabric:false,automaticSave:await saveCapability(executeCommand)};
        writeFileSync(connectionFile,JSON.stringify({protocol:'task-tools-v2',serviceUrl,capabilities}),{mode:0o600});
        return {project,connection:{protocol:'task-tools-v2',serviceUrl,controlTokenFile:tokenFile},capabilities};
      }
    }catch{}
    await new Promise(yes=>setTimeout(yes,250));
  }
  throw fail('Coordinator did not become ready; no report changes were dispatched.','COORDINATOR_NOT_READY');
  } finally {closeSync(lock);unlinkSync(startupLock);}
}
