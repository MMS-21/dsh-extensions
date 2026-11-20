// Verify the session-delete host apply(): route registration and RPC envelope behavior.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const plugin = await import(new URL('../index.js', import.meta.url).href);

const route = {};
const ctx = {
  connection: {
    fetch: {
      register(spec) {
        Object.assign(route, spec);
        return () => {};
      },
    },
  },
  effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {}; },
  sessionPersistence: {list: async () => []},
  sessions: {get: () => undefined},
  agents: {get: () => undefined},
  workspaceRegistry: {list: () => [], unarchiveSession: async () => {}, unpinSession: async () => {}},
};

plugin.apply(ctx);

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.message}`); }
}

let nextRpc = 0;
function request(body) {
  return new Request('http://127.0.0.1/api/sessionDelete', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
}
function clientRequest(payload, method = 'sessionDelete') {
  return request({type: 'client-request', rpcId: `r${++nextRpc}`, method, payload});
}
async function resultOf(response) {
  const body = await response.json();
  assert.equal(body.type, 'server-response');
  assert.equal(typeof body.rpcId, 'string');
  return body.result;
}

await check('registers the exact authenticated route', () => {
  assert.equal(route.path, '/api/sessionDelete');
  assert.deepEqual(route.methods, ['POST']);
  assert.equal(route.requestBody, 'buffered');
  assert.equal(typeof route.fetch, 'function');
});

await check('rejects a non-JSON body', async () => {
  const bad = new Request('http://127.0.0.1/api/sessionDelete', {method: 'POST', body: 'not json'});
  const result = await resultOf(await route.fetch(bad));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'gateway/bad-request');
  assert.equal(typeof result.error.details, 'object');
});

await check('rejects a non client-request envelope', async () => {
  const result = await resultOf(await route.fetch(request({sessionId: 's1'})));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'gateway/bad-request');
});

await check('rejects a mismatched method', async () => {
  const result = await resultOf(await route.fetch(clientRequest({sessionId: 's1'}, 'otherMethod')));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'gateway/bad-request');
});

await check('rejects a missing session id', async () => {
  const result = await resultOf(await route.fetch(clientRequest({})));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'gateway/bad-request');
});

await check('reports an unknown session through the route', async () => {
  const result = await resultOf(await route.fetch(clientRequest({sessionId: 'missing'})));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'session/not-found');
});

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
