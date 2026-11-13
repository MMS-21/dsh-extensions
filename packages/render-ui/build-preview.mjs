import {build} from 'esbuild';import fs from 'node:fs';
const result=await build({entryPoints:['src/preview-entry.jsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'text'},minify:true});
fs.writeFileSync('openui-preview.html','<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OpenUI integration test</title><style>body{margin:0;padding:16px;background:#12151c;color:#e7edf6;font:15px system-ui}button{cursor:pointer}#root{min-width:0}</style><div id="root"></div><script>'+result.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script></html>');
console.log('Built isolated browser verification preview (not replacement Desktop server)');
