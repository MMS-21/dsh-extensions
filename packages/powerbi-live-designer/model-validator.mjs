// Offline semantic validation only. Never connects to a live Desktop instance.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {withMicrosoftMcp} from './microsoft-mcp.mjs';

const project=resolve(process.argv[2]);
const descriptor=JSON.parse(readFileSync(project,'utf8'));
const reports=descriptor.artifacts.filter(item=>item.report).map(item=>item.report.path);
if(reports.length!==1)throw new Error('Expected one report');
const report=resolve(dirname(project),reports[0]);
const definition=JSON.parse(readFileSync(resolve(report,'definition.pbir'),'utf8'));
const relative=definition.datasetReference?.byPath?.path;
if(!relative)throw new Error('Offline semantic validation needs a local model reference');
const folder=resolve(report,relative);
await withMicrosoftMcp(async api=>{
  const result=await api.call('connection_operations',{request:{operation:'ConnectFolder',folderPath:folder}});
  for(const part of result.content??[])if(part.type==='text') {
    const body=JSON.parse(part.text);
    if(body.error || body.success===false)throw new Error('Microsoft rejected the staged model');
  }
  console.log(JSON.stringify({passed:true,scope:'offline-tmdl-deserialization',
    runtimeData:'not-processed',daxResults:'unverified',liveDesktopChanged:false}));
});
