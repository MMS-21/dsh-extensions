import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=path.dirname(fileURLToPath(import.meta.url));
const external=['react','react/*','react-dom','react-dom/*'];
process.env.OPENUI_TELEMETRY_DISABLED='1';process.env.DO_NOT_TRACK='1';
let telemetryPatches=0;
const noRuntimeTelemetry={name:'disable-openui-runtime-telemetry',setup(build){build.onLoad({filter:/shared-.*\.mjs$/},async args=>{
  if(!args.path.includes('lang-core'))return;
  const contents=await fs.promises.readFile(args.path,'utf8');
  if(!contents.includes('function isRuntimeTelemetryEnabled(env)'))return;
  telemetryPatches++;
  return {contents:contents.replace(/function isRuntimeTelemetryEnabled\(env\) \{[\s\S]*?\n\}/,'function isRuntimeTelemetryEnabled(env) { return false; }'),loader:'js'};
});}};
await build({entryPoints:[path.join(root,'src/openui-library.jsx')],outfile:path.join(root,'lib/openui-library-build.mjs'),bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const {library}=await import(pathToFileURL(path.join(root,'lib/openui-library-build.mjs')).href+'?t='+Date.now());
const instructions=library.prompt({bindings:true,builtinFunctions:true,toolCalls:true,additionalRules:[
 'This UI renders INSIDE the existing DSH chat. Compose any suitable registered component; do not replace the chat app.',
 'Use all available components for the task, including responsive layouts, forms, tabs, charts, maps, and media.',
 'Use RecommendationCards for visual shortlists. Each Recommendation pairs its name, direct photo URL, alt text, source page, reason to choose it, and optional alternative. Use the same cards for requests to see a place or find a substitute.',
 'Use AnalyticsDashboard for the ObsidianUI engineering dashboard (repositories, PR review queue, activity charts and details). It belongs to the standard library: root = Stack([AnalyticsDashboard(...)]) with no library=dashboard. Supply complete real Query-backed data. Set mock=true for examples. Optional answerTool calls an existing session tool on user submission; otherwise questions draft into the source chat for review and Send. StatusBars shows supplied daily service/job observations; missing days are none, never inferred successes.',
 'Data must come from actual tools or supplied data. Label invented examples as mock. Reuse named data references rather than repeating large datasets.',
 'Query and Mutation call registered DSH tools through the session-scoped server executor. Existing permissions, sandboxing, tool visibility and approvals apply. Unknown tools fail. Query auto-runs on render and argument changes: use it only for intended reads. Mutation runs only through @Run after user interaction: use it for writes. Never put a write operation in Query. Saved views re-fetch Queries when reopened. No tools run in streaming previews. @ToAssistant remains available for agent-directed tasks.',
 'No arbitrary HTML, scripts, credentials, network endpoints or executable code. Use text and registered components. Keep output within 200000 characters and bounded node/data budgets.',
 'The root is Stack. Render via render_ui({lang: "...OpenUI Lang...", title:"..."}). Do not wrap the DSL in JSON or markdown fences.',
 'Existing legacy cards remain supported with spec; do not combine spec with lang.'
]});
fs.writeFileSync(path.join(root,'lib/openui-schema.json'),JSON.stringify(library.toJSONSchema()));
fs.writeFileSync(path.join(root,'lib/openui-instructions.json'),JSON.stringify({libraryVersion:'dsh-openui-1',components:Object.keys(library.components),instructions}));
await build({entryPoints:[path.join(root,'src/openui-validate.js')],outfile:path.join(root,'lib/openui-validate.js'),bundle:true,platform:'node',format:'esm',plugins:[noRuntimeTelemetry],define:{'process.env.NODE_ENV':'"production"'},external:['@modelcontextprotocol/sdk','@modelcontextprotocol/sdk/*']});
await build({entryPoints:[path.join(root,'src/dashboard-library.jsx')],outfile:path.join(root,'lib/dashboard-library-build.mjs'),bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const {library: legacyDashboard, libraryV2, promptOptions: legacyPrompt, promptOptionsV2}=await import(pathToFileURL(path.join(root,'lib/dashboard-library-build.mjs')).href+'?t='+Date.now());
for (const [name, version, dashboardLibrary, dashboardPromptOptions] of [
  ['dashboard', 'dsh-openui-dashboard-1', legacyDashboard, legacyPrompt],
  ['dashboard-v2', 'dsh-openui-dashboard-2', libraryV2, promptOptionsV2],
]) {
  const dashboardInstructions=dashboardLibrary.prompt({bindings:true,builtinFunctions:true,toolCalls:true,
    preamble:dashboardPromptOptions.preamble,
    examples:dashboardPromptOptions.examples,
    additionalRules:[
      ...dashboardPromptOptions.additionalRules,
      'Query and Mutation call registered DSH tools through the session-scoped server executor. Existing permissions, sandboxing, tool visibility and approvals apply. Unknown tools fail. Query auto-runs on render and argument changes: use it only for intended reads. Mutation runs only through @Run after user interaction: use it for writes. Never put a write operation in Query. Saved views re-fetch Queries when reopened. No tools run in streaming previews. @ToAssistant remains available for agent-directed tasks.',
      'No arbitrary HTML, scripts, credentials, network endpoints or executable code. Use text and registered components. Keep output within 200000 characters and bounded node/data budgets.',
      'Render via render_ui({lang: "...OpenUI Lang...", title:"...", library:"'+name+'"}). Do not wrap the DSL in JSON or markdown fences.'
    ]});
  fs.writeFileSync(path.join(root,'lib/'+name+'-schema.json'),JSON.stringify(dashboardLibrary.toJSONSchema()));
  fs.writeFileSync(path.join(root,'lib/'+name+'-instructions.json'),JSON.stringify({libraryVersion:version,components:Object.keys(dashboardLibrary.components),instructions:dashboardInstructions}));
}
await build({entryPoints:[path.join(root,'src/dashboard-validate.js')],outfile:path.join(root,'lib/dashboard-validate.js'),bundle:true,platform:'node',format:'esm',plugins:[noRuntimeTelemetry],define:{'process.env.NODE_ENV':'"production"'},external:['@modelcontextprotocol/sdk','@modelcontextprotocol/sdk/*']});
const result=await build({entryPoints:[path.join(root,'src/client-entry.jsx')],bundle:true,write:false,platform:'browser',format:'cjs',target:['chrome120'],external,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.OPENUI_TELEMETRY_DISABLED':'"1"'},plugins:[noRuntimeTelemetry],loader:{'.css':'text','.module.css':'text'},minify:true,metafile:true,legalComments:'eof'});
if(telemetryPatches<2)throw Error('Runtime telemetry suppression was not applied to both builds');
if(Object.keys(result.metafile.inputs).some(p=>/node_modules\/(react|react-dom)\//.test(p.replace(/\\/g,'/'))))throw Error('A second React runtime was bundled');
const code=result.outputFiles[0].text;
const packageRoots=new Set();
for(const input of Object.keys(result.metafile.inputs)){
  const normalized=input.replace(/\\/g,'/');const marker=normalized.lastIndexOf('node_modules/');if(marker<0)continue;
  const rest=normalized.slice(marker+13).split('/');const parts=rest[0].startsWith('@')?2:1;
  packageRoots.add(path.resolve(normalized.slice(0,marker+13)+rest.slice(0,parts).join('/')));
}
const notices=[];for(const dir of packageRoots){if(!fs.existsSync(dir))continue;const manifest=path.join(dir,'package.json');if(!fs.existsSync(manifest))continue;const pkg=JSON.parse(fs.readFileSync(manifest,'utf8'));for(const name of fs.readdirSync(dir).filter(n=>/^(LICENSE|LICENCE|COPYING|NOTICE)(\.|$)/i.test(n))){const file=path.join(dir,name);if(fs.statSync(file).isFile())notices.push(`===== ${pkg.name}@${pkg.version} · ${name} =====\n`+fs.readFileSync(file,'utf8'));}}
fs.writeFileSync(path.join(root,'lib/THIRD_PARTY_NOTICES.txt'),notices.join('\n\n')+'\n\n'+fs.readFileSync(path.join(root,'src/vendor/obsidian/SOURCE.md'),'utf8'));

fs.writeFileSync(path.join(root,'lib/client.js'),'window.__ModuleLoader__.load({id:"@local/dsh-plugin-render-ui",factory:function(require){var module={exports:{}};var exports=module.exports;\n'+code+'\nreturn module.exports;}});\n');
fs.writeFileSync(path.join(root,'openui-build-meta.json'),JSON.stringify({components:Object.keys(library.components),componentCount:Object.keys(library.components).length,clientBytes:Buffer.byteLength(code),inputs:Object.keys(result.metafile.inputs),externalReact:true,nodeEnv:'production',telemetryDisabled:true},null,2));
// Patch OCEAN_DEFAULT fallback palette to distinct party-representative colors (blue/red)
const clientPath = path.join(root, 'lib/client.js');
let clientSrc = fs.readFileSync(clientPath, 'utf8');
const oldPalette = '["#0D47A1","#1565C0","#1976D2","#1E88E5","#2196F3","#42A5F5","#64B5F6","#90CAF9","#BBDEFB","#E3F2FD","#EFF8FF"]';
const newPalette = '["#4CAF50","#FF9800","#9C27B0","#1976D2","#00BCD4","#D32F2F","#795548","#607D8B"]';
if (clientSrc.includes(oldPalette)) {
  clientSrc = clientSrc.split(oldPalette).join(newPalette);
  fs.writeFileSync(clientPath, clientSrc);
  console.log('Patched OCEAN_DEFAULT fallback palette to blue/red.');
}
console.log(`Built full OpenUI integration: ${Object.keys(library.components).length} components; ${Buffer.byteLength(code)} browser bytes; ${instructions.length} instruction characters`);




