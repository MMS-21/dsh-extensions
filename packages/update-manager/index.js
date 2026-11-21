import os from 'node:os';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {inspectCompatibility, readManifest} from './compatibility.js';
import {checkRenderUiRelease, stageRenderUiRelease} from './releases.js';

export const name = 'extension-update-manager';
export const inject = ['tools', 'connection'];

export function apply(ctx, config = {}) {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'app.asar', 'dsh'),
    fileURLToPath(new URL('../../../resources/app.asar/dsh/', import.meta.url)),
    path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'Programs', 'DeepSeek Harness', 'resources', 'app.asar', 'dsh'),
  ];
  const runtime = config.runtimeRoot ?? process.env.DSH_RUNTIME_ROOT
    ?? candidates.find(candidate => candidate && existsSync(path.join(candidate, 'package.json')));
  const profile = config.profileDir ?? process.env.DSH_PROFILE_DIR
    ?? path.join(os.homedir(), '.dsh', 'profiles', 'desktop');
  async function run(check, signal) {
    if (!runtime) throw Error('The packaged DSH runtime could not be located.');
    const extensions = inspectCompatibility(runtime, profile);
    const installed = extensions.find(row => row.name === '@local/dsh-plugin-render-ui');
    if (!installed || installed.error) return {extensions, renderUi:{status:'not-inspected'}};
    const dshVersion = readManifest(path.join(runtime, 'package.json')).version;
    try {
      const renderUi = await check({installed, dshVersion, signal, directory:path.join(profile, '.extension-updates')});
      return {extensions, renderUi};
    } catch (error) {
      signal?.throwIfAborted();
      return {extensions, renderUi:{status:'check-failed', reason:error.message}};
    }
  }

  const register = (name, description, check) => ctx.tools.register({
    name,
    description,
    parameters: {type:'object', properties:{}, additionalProperties:false},
    output: {
      schema:{type:'object'},
      render:(_args, result) => [{type:'text', text:JSON.stringify(result, null, 2)}],
    },
    execute:(_args, execution) => run(check, execution?.signal),
  });
  register('extension_update_check', 'Check DSH compatibility and look for a tested Render UI release.', checkRenderUiRelease);
  register('extension_update_stage', 'Download and verify a compatible Render UI release when explicitly requested. Stages the archive for later installation.', stageRenderUiRelease);

  for (const [action, handler] of [['check', checkRenderUiRelease], ['stage', stageRenderUiRelease]]) {
    const method = `extension-updates/${action}`;
    ctx.effect(() => ctx.connection.fetch.register({
      path:`/api/${method}`,
      methods:['POST'],
      requestBody:'buffered',
      async fetch(request) {
        const body = await request.json().catch(() => null);
        const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : 'invalid';
        const respond = result => Response.json({type:'server-response', rpcId, result});
        const failure = (code, message) => respond({ok:false, error:{code, message, details:{}}});
        if (body?.type !== 'client-request' || body.method !== method) {
          return failure('gateway/bad-request', 'Invalid extension update request.');
        }
        try {
          return respond({ok:true, value:await run(handler, request.signal)});
        } catch (error) {
          return failure('extension-updates/failed', error.message);
        }
      },
    }), `extension update manager: ${action}`);
  }
}
