/**
 * Host half of the session-delete bundle.
 *
 * Registers one authenticated fetch route on the shared Connection channel:
 *
 *   POST /api/sessionDelete  { sessionId }
 *
 * The route permanently removes one stored session: its artifact directory, its
 * Workspace-registry membership, and its archive/pin marks. It refuses a running
 * session and a parent session so a delete can never tear a log out from under
 * an active turn or orphan a subagent catalog; a live-but-idle session (one a
 * resident view still holds) is detached first.
 *
 * The persistence seam has no deletion API by design, so the route locates the
 * session through `sessionPersistence.list()` (which exposes each artifact's
 * `location.path`) and removes that directory directly. The projection cache is
 * a disposable derived store keyed by a lifecycle identity, so a stale row for
 * a removed session is rejected at read time and needs no explicit cleanup.
 */
import {rm} from 'node:fs/promises';
import {dirname} from 'node:path';

export const inject = ['connection', 'sessionPersistence', 'workspaceRegistry', 'sessions', 'agents'];

const ROUTE = '/api/sessionDelete';
const ROUTE_GUARD = Symbol.for('@local/session-delete.route');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}

/**
 * Wrap one RPC result in the Connection `server-response` envelope the client's
 * `rpc.call` parser requires.
 */
function serverResponse(rpcId, result) {
  return json({type: 'server-response', rpcId, result});
}

function failure(rpcId, code, message) {
  return serverResponse(rpcId, {ok: false, error: {code, message, details: {}}});
}

function coded(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Delete one stored session permanently.
 * @param ctx - Host context carrying the persistence, registry, and live stores.
 * @param sessionId - the session to remove.
 * @returns the removed session id.
 */
export async function deleteSession(ctx, sessionId) {
  const snapshots = await ctx.sessionPersistence.list();
  const snapshot = snapshots.find((entry) => entry.header?.id === sessionId);
  if (snapshot === undefined) throw coded(`session "${sessionId}" was not found`, 'session/not-found');

  const location = snapshot.location?.path;
  if (typeof location !== 'string' || location === '') {
    throw coded(`session "${sessionId}" has no stored log to delete`, 'session/not-stored');
  }

  const agent = ctx.agents.get(sessionId);
  if (agent !== undefined && agent.status === 'running') {
    throw coded('session is running; stop it before deleting it', 'session/running');
  }

  const children = snapshots.filter((entry) => entry.header?.parentSession === sessionId);
  if (children.length > 0) {
    throw coded(`session has ${children.length} child session(s); delete them first`, 'session/has-children');
  }

  // A sidebar row can still be held live by a resident view even when no
  // conversation is visibly open. Detach an idle live session (and its agent)
  // through the registries so the stored log is not removed from under an open
  // writer; the owning fiber's own detach disposer becomes a no-op afterwards.
  if (ctx.sessions.get(sessionId) !== undefined || agent !== undefined) {
    const sessionEntry = ctx.sessions.store?.get(sessionId);
    const agentEntry = ctx.agents.store?.get(sessionId);
    try {
      if (sessionEntry && typeof ctx.sessions.detachEntered === 'function') ctx.sessions.detachEntered(sessionEntry);
      if (agentEntry && typeof ctx.agents.detachEntered === 'function') ctx.agents.detachEntered(agentEntry);
    } catch {
      throw coded('session could not be detached; stored history was preserved', 'session/detach-failed');
    }
  }

  if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
    throw coded('session is still live; stored history was preserved', 'session/detach-failed');
  }

  await rm(dirname(location), {recursive: true, force: true});

  for (const workspace of ctx.workspaceRegistry.list()) {
    if (workspace.sessionIds.includes(sessionId)) await workspace.detachSession(sessionId);
  }
  await ctx.workspaceRegistry.unarchiveSession(sessionId);
  await ctx.workspaceRegistry.unpinSession(sessionId);

  return {sessionId};
}

/**
 * Mount the delete route. A composition may instantiate the plugin twice (two
 * profile roots, HMR), and a duplicate exact-route registration throws, so a
 * process-wide guard remembers the live registration.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  const connection = ctx.connection;
  if (!connection || typeof connection.fetch?.register !== 'function') return;
  if (connection[ROUTE_GUARD]) return;

  const dispose = connection.fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let body;
      try {
        body = await request.json();
      } catch {
        return failure('invalid', 'gateway/bad-request', 'body is not JSON');
      }
      const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : 'invalid';
      if (body?.type !== 'client-request') {
        return failure(rpcId, 'gateway/bad-request', 'invalid client-request message');
      }
      if (body.method !== 'sessionDelete') {
        return failure(rpcId, 'gateway/bad-request', `method ${JSON.stringify(body.method)} does not match endpoint "sessionDelete"`);
      }
      const sessionId = body.payload?.sessionId;
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        return failure(rpcId, 'gateway/bad-request', 'sessionId is required');
      }
      try {
        const value = await deleteSession(ctx, sessionId);
        return serverResponse(rpcId, {ok: true, value});
      } catch (error) {
        return failure(rpcId, error?.code ?? 'session/delete-failed', String(error?.message ?? error));
      }
    },
  });

  connection[ROUTE_GUARD] = dispose;
  ctx.effect(() => () => {
    delete connection[ROUTE_GUARD];
    try {
      dispose();
    } catch {}
  }, 'session-delete: route');
}
