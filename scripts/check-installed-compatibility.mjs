import {dshProfilePath, dshRuntimeRoot} from './local-paths.mjs';
import {inspectCompatibility} from '../packages/update-manager/compatibility.js';

const runtime = dshRuntimeRoot();
const extensions = inspectCompatibility(runtime, dshProfilePath());
console.log(JSON.stringify({
  runtime,
  extensions,
  note:'Metadata inspection only; matching declarations do not certify runtime behavior.',
}, null, 2));
