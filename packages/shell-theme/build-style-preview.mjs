// Isolated visual QA using extracted installed styles; does not run shell code.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const evidence=path.resolve(process.argv[2]||'D:/DSH/shell-style-evidence');
const output=path.resolve(process.argv[3]||'D:/DSH/render-inline-check/index.html');
const read=name=>fs.readFileSync(path.join(evidence,name),'utf8');
const source=fs.readFileSync(new URL('./client.js',import.meta.url),'utf8');
let plugin,theme;
vm.runInNewContext(source,{window:{__ModuleLoader__:{load(p){plugin=p.factory(()=>({}));}}},document:{getElementById(){return null;},createElement(){return {};},addEventListener(){},head:{appendChild(s){theme=s.textContent;}}}});
plugin.apply({effect(){}});
const moduleCss=(module,name,sourceFile)=>{
 const bundle=read(module);
 const map=bundle.match(new RegExp('var '+name+'_module_css_default=\\{([^}]+)\\}'))?.[1];
 if(!map)throw Error('Missing class map '+name);
 const classes=Object.fromEntries([...map.matchAll(/"([^"]+)":`([^`]+)`/g)].map(m=>[m[1],m[2]]));
 return read(sourceFile).replace(/\.([A-Za-z][A-Za-z0-9_-]*)/g,(whole,key)=>classes[key]?'.'+classes[key]:whole);
};
const css=read('frontend-index-CSAdOBx6.css')+moduleCss('node_modules-@deepseek-ai-dsh-client-ui-model-selection-lib-client.js','ModelSelect','@deepseek-ai-dsh-client-ui-model-selection-src-client-ModelSelect.module.css');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><title>DSH theme consistency preview</title>
<style>${css}\n${theme}
:root{color-scheme:dark;--dsw-alias-label-primary:#ececec;--dsw-alias-label-secondary:#b8b8b8;--dsw-alias-label-tertiary:#a8a8a8;--dsw-alias-label-caption:#a8a8a8;--dsw-alias-label-dimmed:#777;--dsw-alias-label-primary-inverted:#171717;--dsw-alias-bg-layer-1:#262626;--dsw-alias-bg-layer-2:#212121;--dsw-specific-menu:#212121;--dsw-alias-interactive-bg-hover:#ffffff0f;--dsw-alias-border-l2:#444;--dsw-focus-ring-color:#b8b8b8;--dsw-alias-state-error-primary:#ef8d8d;--dsw-alias-state-warn-primary:#e3bb69;--dsw-elevation-prominent:0 8px 28px #0003;--dsw-elevation-soft:0 2px 8px #0001}
:root[data-theme=light]{color-scheme:light;--dsw-alias-label-primary:#222;--dsw-alias-label-secondary:#555;--dsw-alias-label-tertiary:#666;--dsw-alias-label-caption:#666;--dsw-alias-label-dimmed:#888;--dsw-alias-label-primary-inverted:#fff;--dsw-alias-bg-layer-1:#f5f5f5;--dsw-alias-bg-layer-2:#fff;--dsw-specific-menu:#fff;--dsw-alias-interactive-bg-hover:#0000000a;--dsw-alias-border-l2:#ddd;--dsw-focus-ring-color:#555;--dsw-alias-state-error-primary:#ad2727;--dsw-alias-state-warn-primary:#805b12}
body{margin:0;padding:24px;background:#141414;color:var(--dsw-alias-label-primary);font:14px/1.5 system-ui}html[data-theme=light] body{background:#f4f4f4}h1{font-size:20px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}header button{background:var(--dsw-alias-interactive-bg-hover);color:inherit;border:0;border-radius:8px;padding:8px 12px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:24px}.qa-cell{min-width:0}.qa-cell>h2{font-size:14px;margin:0 0 12px}.qa-cell ._9r0rkG_menu,.qa-cell ._list_70kcw_7{position:relative;inset:auto;min-width:0;max-width:100%;width:100%;height:auto;max-height:none;background:var(--dsw-specific-menu)}.qa-cell ._dialog_1ytzq_33{max-width:100%;margin:0}.qa-compact{margin-top:16px}#qa-status{margin-top:24px;color:var(--dsw-alias-label-secondary)}
</style><header><h1>DSH theme consistency</h1><button id="theme-toggle">Switch to light</button></header><main>
<section class="qa-cell"><h2>Model picker</h2><div class="_9r0rkG_menu"><div class="_9r0rkG_searchRow"><div class="_9r0rkG_search"><input aria-label="Search models" placeholder="Search models"></div></div><div class="_9r0rkG_groups"><button class="_9r0rkG_option _9r0rkG_optionActive"><span class="_9r0rkG_modelName">GPT · selected model</span></button><button class="_9r0rkG_option"><span class="_9r0rkG_modelName">A model with a very long descriptive name for overflow checking</span></button><button disabled class="_9r0rkG_option"><span class="_9r0rkG_modelName">Unavailable model</span></button></div></div></section>
<section class="qa-cell"><h2>Permission menu</h2><div class="_list_70kcw_7" role="menu"><button role="menuitem" class="_item_70kcw_173">Read only</button><button role="menuitem" class="_item_70kcw_173 _selectedFill_70kcw_313">Auto review · selected</button><button role="menuitem" class="_item_70kcw_173 _danger_70kcw_318">Full access</button><button disabled role="menuitem" class="_item_70kcw_173">Unavailable action</button></div><h2 class="qa-compact">Compact menu</h2><div class="_list_70kcw_7 _compactList_70kcw_218" role="menu"><button role="menuitem" class="_item_70kcw_173">Copy message</button><button role="menuitem" class="_item_70kcw_173">Open in artifact</button></div></section>
<section class="qa-cell"><h2>Confirmation</h2><div class="_dialog_1ytzq_33 _warning_1ytzq_87" role="dialog" aria-label="Permission confirmation"><div class="_content_1ytzq_63"><div class="_header_1ytzq_71"><h2 class="_title_1ytzq_79">Enable full access?</h2><button class="_close_1ytzq_103" aria-label="Close confirmation">×</button></div><p class="_description_1ytzq_124">The warning and acknowledgement remain visible. This preview changes no permissions.</p></div><div class="_footer_1ytzq_141"><button class="_button_1ulci_2 _outline_1ulci_56">Cancel</button><button disabled class="_button_1ulci_2 _primary_1ulci_36">Confirm</button></div></div></section>
</main><p id="qa-status" role="status"></p><script>
const toggle=document.getElementById('theme-toggle');toggle.onclick=()=>{const light=document.documentElement.dataset.theme!=='light';document.documentElement.dataset.theme=light?'light':'dark';toggle.textContent=light?'Switch to dark':'Switch to light';check();};
function check(){requestAnimationFrame(()=>{const search=document.querySelector('._9r0rkG_search');const border=getComputedStyle(search).borderTopColor;const overflow=document.documentElement.scrollWidth>innerWidth;document.getElementById('qa-status').textContent=(overflow?'FAIL: page overflow':'PASS: no page overflow')+' · Search border: '+border;});}check();addEventListener('resize',check);
</script></html>`;
// Match the host TextInput primitive rather than a browser-default input.
const faithful=html.replace('class="_9r0rkG_search"><input','class="_9r0rkG_search _wrap_14sgc_1"><input class="_input_14sgc_25"')
  .replaceAll('<span class="_9r0rkG_modelName">','<span class="_9r0rkG_optionCopy"><span class="_9r0rkG_modelName">')
  .replaceAll('</span></button>','</span></span></button>');
fs.writeFileSync(output,faithful);
console.log('Built isolated preview with installed CSS, theme overrides and representative theme tokens: '+output);
