/**
 * Host transport for OpenUI `Query`/`Mutation` tool execution.
 *
 * The renderer calls `POST /api/openuiToolExecution/execute` through the shared
 * Connection RPC channel. That channel is normally served by the Typert
 * Gateway, which needs `@deepseek-ai/dsh-typert-protocol` and
 * `@deepseek-ai/dsh-tools`; those are peer dependencies that are not installed
 * in every profile, so this module registers an exact Fetch route on the same
 * path instead. Exact routes bypass the Gateway and are handled directly by
 * Connection, which keeps the feature working with only `tools`, `agents`,
 * and `connection` injected.
 */

import {executeUiTool, describeError} from './tool-execution.js';
import {validateJsonSchemaValue} from './tool-schema.js';

const ROUTE_PATH = '/api/openuiToolExecution/execute';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function serverResponse(rpcId, result) {
  return jsonResponse({ type: 'server-response', rpcId, result });
}

function failure(rpcId, code, message) {
  return serverResponse(rpcId, { ok: false, error: { code, message, details: {} } });
}

/**
 * Register the OpenUI tool-execution endpoint.
 * @param ctx - plugin context carrying `connection`, `tools`, and `agents`.
 * @returns the route disposer, or undefined when the connection seat is absent.
 */
export function installToolExecution(ctx) {
  let connection;
  try { connection = ctx.connection; } catch { connection = undefined; }
  if (!connection || typeof connection.fetch?.register !== 'function') return undefined;
  // A composition may instantiate the plugin twice (two profile roots, HMR); a
  // duplicate exact-route registration throws, so remember the live one.
  const key = Symbol.for('dsh-plugin-render-ui.toolExecutionRoute');
  if (connection[key]) return connection[key];
  let dispose;
  try {
    dispose = connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
      let body;
      try { body = await request.json(); } catch { return failure('invalid', 'gateway/bad-request', 'body is not JSON'); }
      const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : 'invalid';
      if (body?.type !== 'client-request') {
        return failure(rpcId, 'gateway/bad-request', 'invalid client-request message');
      }
      if (body.method !== 'openuiToolExecution/execute') {
        return failure(rpcId, 'gateway/bad-request',
          `method ${JSON.stringify(body.method)} does not match endpoint "openuiToolExecution/execute"`);
      }
      const args = body.payload?.args;
      const agentId = args?.agentId;
      let agent;
      try { agent = typeof agentId === 'string' ? ctx.agents.get(agentId) : undefined; }
      catch { agent = undefined; }
      if (agent === undefined) {
        return failure(rpcId, 'gateway/bad-request', `unknown session agent ${JSON.stringify(agentId ?? null)}`);
      }
      try {
        const value = await executeUiTool(ctx, agent, args.request, request.signal, validateJsonSchemaValue);
        return serverResponse(rpcId, { ok: true, value });
      } catch (error) {
        return failure(rpcId, 'gateway/internal', describeError(error));
      }
    },
    });
  } catch { return undefined; }
  connection[key] = dispose;
  // Clear the guard when this plugin unloads so a later enable can re-register.
  try { ctx.effect?.(() => () => { try { delete connection[key]; } catch {} }); } catch {}
  return dispose;
}
