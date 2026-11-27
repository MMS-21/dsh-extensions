import {build} from 'esbuild';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const dir = new URL('./', import.meta.url);
const out = new URL('lib/', dir);
const bundle = async (entry, options = {}) => {
  const {outputFiles} = await build({
    entryPoints:[fileURLToPath(new URL(entry, dir))],
    bundle:true, platform:'browser', format:'iife', write:false,
    target:'chrome120', minify:true, legalComments:'eof', ...options,
  });
  return outputFiles[0].text;
};
const frame = await bundle('renderer.js');
const client = await bundle('client.js', {define:{__MERMAID_FRAME_SCRIPT__:JSON.stringify(frame)}});
await mkdir(out, {recursive:true});
await writeFile(new URL('client.js', out), client);
