import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const binary=fileURLToPath(new URL('./node_modules/agent-desktop/bin/agent-desktop-win32-x64.exe',import.meta.url));
const child=spawn(binary,['mcp'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
const waiting=new Map();let counter=0,buffer='',stderr='';
const deadline=setTimeout(()=>{for(const job of waiting.values())job.reject(Error('MCP timeout'));child.kill();},20000);
child.stderr.on('data',data=>{stderr=(stderr+data).slice(-4000);});
child.stdout.on('data',data=>{
  buffer+=data;
  for(;;){const index=buffer.indexOf('\n');if(index<0)break;const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);if(!line)continue;
    try{const message=JSON.parse(line);if(message.id!=null){const job=waiting.get(message.id);if(job){waiting.delete(message.id);message.error?job.reject(Error(JSON.stringify(message.error))):job.resolve(message.result);}}}catch(error){for(const job of waiting.values())job.reject(error);}
  }
});
child.on('error',error=>{for(const job of waiting.values())job.reject(error);});
const call=(method,params)=>new Promise((resolve,reject)=>{const id=++counter;waiting.set(id,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
try{
  const initialized=await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'dsh-integration-verifier',version:'1.0.0'}});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const catalog=await call('tools/list',{});
  const names=catalog.tools.map(tool=>tool.name);
  for(const name of ['desktop_snapshot','desktop_click','desktop_version'])assert.ok(names.includes(name),name);
  const result=await call('tools/call',{name:'desktop_version',arguments:{}});
  assert.ok(!result.isError,JSON.stringify(result));
  const envelope=JSON.parse(result.content.find(block=>block.type==='text').text);
  assert.equal(envelope.ok,true);assert.equal(envelope.data.version,'1.3.0');
  writeFileSync(new URL('./mcp-catalog.json',import.meta.url),JSON.stringify({server:initialized.serverInfo,instructions:initialized.instructions,tools:catalog.tools},null,2));
  writeFileSync(new URL('./verification.json',import.meta.url),JSON.stringify({version:'1.3.0',protocol:initialized.protocolVersion,toolCount:names.length,initialize:true,toolsList:true,versionCall:true,desktopObserved:false,desktopModified:false},null,2));
  console.log(`PASS: MCP initialize, ${names.length} tools discovered, desktop_version returned 1.3.0. No desktop observations or actions.`);
}catch(error){console.error(stderr);throw error;}
finally{clearTimeout(deadline);child.stdin.end();child.kill();}
