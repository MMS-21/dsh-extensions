import {dshRuntimeRoot} from '../../scripts/local-paths.mjs';
// Actual packaged DSH rc.3 MCP client; version is the only invoked desktop tool.
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
const base=pathToFileURL(dshRuntimeRoot()+'node_modules/@deepseek-ai/').href;
const {Context}=await import(base+'cordis/lib/index.js');
const {ToolRuntime}=await import(base+'dsh-tools/lib/index.js');
const {NativeToolExecutor}=await import(base+'dsh-tool-executor-native/lib/index.js');
const {createScope}=await import(base+'dsh-scope/lib/index.js');
const mcp=await import(base+'dsh-mcp-client/lib/index.js');
const ctx=new Context();
const provide=(name,value)=>{ctx.provide(name);ctx.set(name,value);};
provide('systemPrompt',{tools(){},section(){return ()=>{};}});
new ToolRuntime(ctx,{mode:'native'});ctx.tools.setExecutor(new NativeToolExecutor(ctx));
const config={serverName:'agent_desktop',transport:'stdio',command:fileURLToPath(new URL('./node_modules/agent-desktop/bin/agent-desktop-win32-x64.exe',import.meta.url)),args:['mcp'],cwd:fileURLToPath(new URL('.',import.meta.url)),env:{},toolCallTimeoutMs:60000,startupTimeoutMs:15000,closeTimeoutMs:5000,expandTemplates:false,failOnStartupError:true,maxInstructionBytes:32768,reconnect:{enabled:false,initialDelayMs:500,maxDelayMs:30000,maxAttempts:1}};
const fiber=ctx.plugin(mcp,config);
let scope;
try{
  await fiber.await();
  const agent={session:{id:'agent-desktop-integration-check'}};scope=createScope(ctx,agent);agent.ctx=scope.ctx;
  const name='mcp__agent_desktop__desktop_version';
  assert.ok(ctx.tools.get(name,agent),'DSH must discover the namespaced tool');
  assert.ok(ctx.tools.get('mcp__agent_desktop__desktop_snapshot',agent));
  const batch=await ctx.tools.execute({agent,signal:new AbortController().signal,calls:[{type:'tool-call',id:'version-check',name,arguments:'{}'}]});
  const result=batch.results[0].result;
  assert.ok(!result.isError,JSON.stringify(result));
  const envelope=JSON.parse(result.value.content.find(block=>block.type==='text').text);
  assert.equal(envelope.data.version,'1.3.0');
  writeFileSync(new URL('./dsh-verification.json',import.meta.url),JSON.stringify({dsh:'0.2.2-rc.3',actualPackagedMcpClient:true,toolDiscovery:true,scopedToolExecution:true,nativeVersion:'1.3.0',desktopObserved:false,desktopModified:false},null,2));
  console.log('PASS: actual DSH rc.3 MCP client discovers agent-desktop and executes its version tool through the scoped native executor.');
}finally{if(scope)await scope.dispose();await fiber.dispose();}
