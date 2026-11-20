// Operator-side MCP transport. Starting/listing never implies EULA acceptance.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';

export async function withMicrosoftMcp(work) {
  const exe=process.env.PBI_MODELING_MCP_EXE || fileURLToPath(new URL('./authoring-tools/node_modules/@microsoft/powerbi-modeling-mcp-win32-x64/dist/powerbi-modeling-mcp.exe',import.meta.url));
  const accepted=(()=>{try{return readFileSync(new URL('./.runtime/modeling-eula-accepted',import.meta.url),'utf8').trim()==='accepted-by-user';}catch{return false;}})();
  const child=spawn(exe,accepted?['--start','--accept-eula']:['--start'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const pending=new Map();let seq=0;let diagnostic='';
  child.stderr.on('data',data=>{diagnostic=(diagnostic+data).slice(-12000);});
  const input=createInterface({input:child.stdout});
  input.on('line',line=>{
    let response;try{response=JSON.parse(line);}catch{return;}
    if(response.id===undefined)return;
    const slot=pending.get(response.id);if(!slot)return;
    pending.delete(response.id);clearTimeout(slot.timer);
    response.error?slot.reject(new Error(JSON.stringify(response.error))):slot.resolve(response.result);
  });
  child.on('error',error=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();});
  child.on('exit',code=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error(`Microsoft MCP exited ${code}: ${diagnostic}`));}pending.clear();});
  function request(method,params={},timeout=120000){
    const id=++seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`MCP timeout during ${method}; do not retry writes without inspecting state`));},timeout);
      pending.set(id,{resolve,reject,timer});
      child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
    });
  }
  try {
    await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'dsh-powerbi-operator',version:'0.3.0'}});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    return await work({request,call:async(name,args)=>{
      const result=await request('tools/call',{name,arguments:args});
      if(result.isError)throw Object.assign(new Error(JSON.stringify(result)),{code:'MCP_TOOL_FAILED',operation:args.request?.operation,tool:name});
      return result;
    }});
  } finally {
    input.close();child.stdin.end();child.kill();
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('MCP client closed'));}
    pending.clear();
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [operation,name,argsFile]=process.argv.slice(2);
  await withMicrosoftMcp(async api=>{
    const result=operation==='list'?await api.request('tools/list'):await api.call(name,JSON.parse(readFileSync(argsFile,'utf8')));
    writeFileSync('microsoft-mcp-last-result.json',JSON.stringify(result,null,2)+'\n');
    console.log(operation==='list'?JSON.stringify(result.tools.map(tool=>({name:tool.name,description:tool.description?.slice(0,200)})),null,2):JSON.stringify(result,null,2));
  });
}
