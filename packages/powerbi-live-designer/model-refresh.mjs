import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {withMicrosoftMcp} from './microsoft-mcp.mjs';
import {resolveDesktopInstance} from './desktop-binding.mjs';

export function mutationAcknowledged(result) {
  // Microsoft's synchronous refresh contract can acknowledge success without content.
  if(result?.isError===false && Array.isArray(result.content) && result.content.length===0)return;
  body(result);
}

export function body(result) {
  if(result?.isError)throw new Error('Microsoft modeling operation rejected');
  const parts=(result?.content??[]).filter(x=>x.type==='text');
  if(parts.length!==1)throw new Error('Unrecognized Microsoft response');
  const value=JSON.parse(parts[0].text);
  if(value.error || value.success===false || value.data?.errorMessage)throw new Error('Microsoft modeling operation failed');
  return value;
}
export async function connectModel(api, project, tables = [], resolveInstance=resolveDesktopInstance) {
  const instances=body(await api.call('connection_operations',{request:{operation:'ListLocalInstances'}})).data;
  if(!Array.isArray(instances))throw new Error('Instance discovery returned no list');
  const instance=await resolveInstance(project,instances);
  if(!Number.isInteger(instance.port)||instance.port<1||instance.port>65535||!Number.isInteger(instance.processId)||!instance.startTime)throw new Error('Incomplete instance identity');
  const connectionName=body(await api.call('connection_operations',{request:{operation:'Connect',dataSource:`localhost:${instance.port}`}})).data;
  if(typeof connectionName!=='string')throw new Error('Missing explicit model connection');
  const request={connectionName};
  const databases=body(await api.call('database_operations',{request:{...request,operation:'List'}})).data;
  if(!Array.isArray(databases)||databases.length!==1||!databases[0].id)throw new Error('Expected exactly one database');
  const inventory=body(await api.call('table_operations',{request:{...request,operation:'List'}})).data;
  if(!Array.isArray(inventory)||tables.some(name=>!inventory.some(t=>t.name===name)))throw new Error('An affected table is missing in the live model');
  return {connectionName, inventory, target:{processId:instance.processId,port:instance.port,startTime:instance.startTime,databaseId:databases[0].id}};
}

export async function inspect(api, project, tables, resolveInstance=resolveDesktopInstance) {
  const {connectionName, target} = await connectModel(api, project, tables, resolveInstance);
  const request = {connectionName};
  const exported=await api.call('model_operations',{request:{...request,operation:'ExportTMDL',tmdlExportOptions:{serializationOptions:{includeChildren:true},maxReturnCharacters:-1}}});
  if(exported.isError)throw new Error('Cannot fingerprint live model');
  const resources=(exported.content??[]).filter(x=>x.type==='resource'&&typeof x.resource?.text==='string');
  if(resources.length!==1||!resources[0].resource.text||resources[0].resource.text.length>8000000)throw new Error('Incomplete live model fingerprint');
  const modelSha256=createHash('sha256').update(resources[0].resource.text).digest('hex');
  return {connectionName,target:{...target,modelSha256}};
}

export async function readTableCount(api, connectionName, table) {
  const escaped = table.replaceAll("'", "''");
  const {data} = body(await api.call('dax_query_operations', {request:{
    connectionName, operation:'Execute', query:`EVALUATE ROW("__dsh_rows", COALESCE(COUNTROWS('${escaped}'), 0))`,
    maxRows:1, resultMode:'Inline', timeoutSeconds:60,
  }}));
  if (data?.isTruncated || data?.rows?.length !== 1) throw Error('Row-count verification returned incomplete results');
  const row = data.rows[0];
  const values = Array.isArray(row) ? row : Object.values(row ?? {});
  if (values.length !== 1 || !Number.isSafeInteger(values[0]) || values[0] < 0) {
    throw Error('Row-count verification returned an invalid value');
  }
  return values[0];
}
export async function run(api, input, emit, resolveInstance=resolveDesktopInstance) {
  const current=await inspect(api,input.project,input.tables,resolveInstance);
  if(input.operation==='inspect')return current.target;
  const identityKeys=input.operation==='verify'?['processId','port','startTime','databaseId']:Object.keys(current.target);
  if(identityKeys.some(key=>current.target[key]!==input.target?.[key]))throw Object.assign(new Error('Live target/model changed; restage refresh within the task authorization'),{code:'MODEL_TARGET_CHANGED'});
  emit({event:'ready'});
  for(const table of input.operation==='verify'?[]:input.tables) {
    await emit({event:'dispatch',table});
    mutationAcknowledged(await api.call('table_operations',{request:{connectionName:current.connectionName,operation:'RefreshWithXMLA',references:[{name:table}],refreshType:'Full'}}));
    emit({event:'refreshed',table});
  }
  const observations=[];
  for(const check of input.checks) {
    const count=await readTableCount(api,current.connectionName,check.table);
    observations.push({table:check.table,rowCount:count,passed:count>=check.minRows && count<=check.maxRows});
  }
  return {modelDataRefreshed:input.operation!=='verify',verified:observations.every(x=>x.passed),observations,
    modelFingerprintChanged:current.target.modelSha256!==input.target.modelSha256,
    canvas:'Visual rendering requires separate evidence',runtimeRollbackAvailable:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const acknowledgments=createInterface({input:process.stdin});
  const lines=acknowledgments[Symbol.asyncIterator]();
  try {const result=await withMicrosoftMcp(api=>run(api,input,async item=>{
    console.log(JSON.stringify(item));
    if(item.event==='dispatch') {const next=await lines.next();if(next.done||next.value!=='dispatch-recorded')throw new Error('Journal acknowledgment required');}
  }));console.log(JSON.stringify({event:'result',result}));}
  catch(error) {
    const stage=typeof error.operation==='string' && /^[A-Za-z]{1,64}$/.test(error.operation)?error.operation:'adapter';
    const code=typeof error.code==='string' && /^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'MODELING_ADAPTER_FAILED';
    console.log(JSON.stringify({event:'error',code,stage,message:'Microsoft refresh adapter failed; inspect journal and live model before retry'}));process.exitCode=1;
  }
  finally {acknowledgments.close();}
}
