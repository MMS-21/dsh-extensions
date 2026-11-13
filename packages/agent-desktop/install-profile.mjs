import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import {dshProfilePath} from '../../scripts/local-paths.mjs';
const directory=fileURLToPath(new URL('.',import.meta.url));
const require=createRequire(import.meta.url);
const platform=require('./node_modules/agent-desktop/lib/platform.js').resolve(process.platform,process.arch);
if(!platform?.released)throw Error('No released binary for this platform');
const binary=path.join(directory,'node_modules','agent-desktop','bin',platform.binaryName);
if(!fs.existsSync(binary))throw Error('Run npm ci first to install the pinned native binary');
const profile=dshProfilePath('cordis.patch.yml');
const original=fs.readFileSync(profile,'utf8');
if(/id:\s*mcp-agent-desktop\b|serverName:\s*agent_desktop\b/.test(original))throw Error('Entry already exists. Update that entry explicitly instead of adding a duplicate.');
const quote=value=>"'"+value.replaceAll('\\','/').replaceAll("'","''")+"'";
const entry=`- insert:\n    - id: mcp-agent-desktop\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: agent_desktop\n        transport: stdio\n        command: ${quote(binary)}\n        args: ['mcp']\n        cwd: ${quote(directory)}\n        toolCallTimeoutMs: 60000\n        startupTimeoutMs: 15000\n        failOnStartupError: false\n`;
fs.writeFileSync(new URL('./dsh-entry.yml',import.meta.url),entry);
if(!process.argv.includes('--apply')){
  console.log('Prepared ignored dsh-entry.yml. Validate it with validate-config.mjs in Electron Node mode, then rerun with --apply.');
}else{
  const backup=profile+'.bak-agent-desktop-'+crypto.randomUUID();
  fs.copyFileSync(profile,backup,fs.constants.COPYFILE_EXCL);
  if(fs.readFileSync(profile,'utf8')!==original)throw Error('Profile changed during backup');
  fs.writeFileSync(profile,original.trimEnd()+'\n\n'+entry);
  console.log('Installed MCP entry; backup saved alongside the private profile. Restart DSH.');
}
