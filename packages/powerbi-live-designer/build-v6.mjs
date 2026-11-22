import {readFileSync, writeFileSync} from 'node:fs';

const client = new URL('./client.js', import.meta.url);
const previews = new URL('./previews/', import.meta.url);
const liveScript = readFileSync(new URL('live.js', previews), 'utf8');
const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:; base-uri 'none'; form-action 'none'";
const docs = {};
for (const name of ['powerbi_live_designer_v6_reference.html','agent_performance_v6_reference.html']) {
  const html = readFileSync(new URL(name, previews), 'utf8');
  const start = html.lastIndexOf('<script>');
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < start || !html.includes('<head>')) throw Error('Invalid v6 preview: ' + name);
  docs[name] = (html.slice(0,start) + '<script>' + liveScript.replaceAll('</script','<\\/script') + html.slice(end))
    .replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
}
const source = readFileSync(client,'utf8');
const region = /(?<=\/\* v6-documents:start \*\/\r?\n)[\s\S]*?(?=\r?\n    \/\* v6-documents:end \*\/)/;
if (!region.test(source)) throw Error('Client document markers missing.');
const result = source.replace(region, () => '    const bundledDocuments = ' + JSON.stringify(docs) + ';');
if (process.argv.includes('--check')) {
  if (result !== source) throw Error('Run npm run build:v6 after editing the v6 documents.');
} else {
  writeFileSync(client,result);
}
