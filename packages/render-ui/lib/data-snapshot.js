import {createHash} from 'node:crypto';

const MAX_BYTES = 64 * 1024;
const MAX_VALUES = 12_000;
const MAX_DEPTH = 24;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function validateDataOptions(args) {
  if (args.dataFile !== undefined && (typeof args.dataFile !== 'string'
    || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.json$/.test(args.dataFile))) {
    throw new TypeError('dataFile must be a JSON filename in .dsh-ui-data under the current workspace.');
  }
  if (args.selectionKeys !== undefined && (!(args.dataFile || args.miniApp) || !Array.isArray(args.selectionKeys)
    || args.selectionKeys.length > 12 || new Set(args.selectionKeys).size !== args.selectionKeys.length
    || args.selectionKeys.some(key => typeof key !== 'string'
      || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || UNSAFE_KEYS.has(key)))) {
    throw new TypeError('selectionKeys requires dataFile or miniApp and up to 12 unique input names without $.');
  }
}

export async function readDataSnapshot(ctx, file, exec) {
  if (!exec?.agent || !ctx.fs || !ctx.workingDirectory) {
    throw new Error('Data snapshots require a session workspace and its filesystem service.');
  }
  const {signal} = exec;
  const cwd = await ctx.workingDirectory.ensure(exec.agent, signal);
  const {fs} = ctx;
  const options = {cwd, signal};
  const directory = '.dsh-ui-data';
  const name = directory + '/' + file;
  if ((await fs.lstat(directory, {cwd}, signal))?.type !== 'directory'
    || (await fs.lstat(name, {cwd}, signal))?.type !== 'file') {
    throw new Error('Put the computed JSON in a regular file under .dsh-ui-data.');
  }
  const workspace = await fs.resolve('.', options);
  const parent = await fs.resolve(directory, options);
  const target = await fs.resolve(name, options);
  if (!fs.contains(workspace, parent) || !fs.contains(parent, target)) {
    throw new Error('Data file must resolve inside the workspace data directory.');
  }
  const bytes = await fs.readBytes(target, signal, MAX_BYTES);
  if (bytes.byteLength > MAX_BYTES) throw new Error('Data snapshot exceeds 64 KiB. Aggregate or page the data first.');
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { throw new Error('Data snapshot must contain valid UTF-8 JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Data snapshot must be a JSON object.');
  let values = 0;
  function check(value, depth) {
    if (++values > MAX_VALUES || depth > MAX_DEPTH) throw new Error('Data snapshot is too large or deeply nested. Aggregate or page it first.');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Data snapshot numbers must be finite.');
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (UNSAFE_KEYS.has(key)) throw new Error('Data snapshot contains a reserved key.');
        check(child, depth + 1);
      }
    }
  }
  check(data, 0);
  return {id: createHash('sha256').update(bytes).digest('hex'), data};
}
