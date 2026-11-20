import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {dshProfilePath, dshRuntimeRoot} from './local-paths.mjs';

const runtime = dshRuntimeRoot();
if (!fs.existsSync(path.join(runtime,'package.json'))) {
  throw Error('DSH runtime was not found. Set DSH_RUNTIME_ROOT to the installed resources/app.asar/dsh directory and run with the installed Electron executable.');
}
const profile = dshProfilePath();
const manifest = JSON.parse(fs.readFileSync(path.join(profile,'package.json'),'utf8'));
const rows = [];
for (const [name, reference] of Object.entries(manifest.dependencies || {})) {
  if (!name.startsWith('@local/') || name.includes('taskboard')) continue;
  try {
    const target = reference.startsWith('link:') || reference.startsWith('file:')
      ? path.resolve(profile, reference.slice(reference.indexOf(':') + 1)) : path.join(profile,'node_modules',name);
    const pkg = JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8'));
    const peers = Object.entries(pkg.peerDependencies || {}).filter(([key]) => key.startsWith('@deepseek-ai/')).map(([key, declared]) => {
      try {
        const actual = JSON.parse(fs.readFileSync(path.join(runtime,'node_modules',key,'package.json'),'utf8')).version;
        // Exact pins can be diagnosed without widening or guessing the meaning of a range.
        return {name:key, declared, actual, status:declared === actual ? 'match' : /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(declared) ? 'mismatch' : 'range-review-needed'};
      } catch { return {name:key, declared, status:'runtime-package-unavailable'}; }
    });
    const runtimeRequire = createRequire(path.join(runtime,'package.json'));
    const missingClientPackages = (pkg.dsh?.client?.inject || []).filter(key => {
      try { runtimeRequire.resolve(key); return false; } catch { return true; }
    });
    rows.push({name,version:pkg.version,peers,missingClientPackages,certified:false});
  } catch(error) { rows.push({name,error:error.code || 'inspection-failed',certified:false}); }
}
console.log(JSON.stringify({runtime,extensions:rows,note:'Metadata inspection only; matching declarations do not certify runtime behavior.'},null,2));
