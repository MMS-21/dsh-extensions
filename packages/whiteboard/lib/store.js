/**
 * Host-side store for the DeepSeek Harness Whiteboard plugin.
 *
 * Mirrors `store.py` from the Hermes original: a set of shared board copies,
 * a sharing flag, and an inbox of agent→page entries. The DSH original of the
 * storage facility is `ctx.storageDomain`. A declared domain table durably
 * stores board copies, sharing and pending proposals. Isolated test hosts
 * without that facility use memory; production declares the service in inject.
 *
 * Every method is async because the storage seat may be async.
 */

import { referenceKey } from './context.js';

export const BOARD_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const ENTRY_ID = /^w[0-9a-f]{12}$/;
export const MAX_INBOX = 50;

const INDEX_KEY = 'whiteboard:boards-v1';
const SHARING_KEY = 'whiteboard:sharing';
const INBOX_INDEX_KEY = 'whiteboard:inbox-index';
const BOARD_PREFIX = 'whiteboard:board:';
const INBOX_PREFIX = 'whiteboard:inbox:';

const awaitable = (value) => (value && typeof value.then === 'function' ? value : Promise.resolve(value));

function memoryBackend() {
  const values = new Map();
  return {
    async get(key) {
      return values.has(key) ? values.get(key) : null;
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

/**
 * Open the domain before registering routes and tools. Storage errors are
 * surfaced to callers rather than reported as successful writes.
 */
export async function createStore(ctx) {
  let domain;
  if (ctx.storageDomain) {
    const { z } = await import('zod');
    domain = await ctx.storageDomain.open({
      name: 'whiteboard', version: 1,
      tables: { values: { valueSchema: z.unknown() } },
    });
    ctx.effect(() => () => domain.close(), 'whiteboard: close durable storage');
  }
  // Memory is only for isolated hosts without the optional storage facility.
  // A configured facility failing to open is an activation error, never a
  // silent downgrade that loses proposals and results at restart.
  const backend = domain ? domain.table('values') : memoryBackend();
  let chain = Promise.resolve();
  const del = async (key) => {
    await awaitable(backend.delete(key));
  };

  async function readJson(key) {
    let value;
    value = await awaitable(backend.get(key));
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }

  async function writeJson(key, value) {
    await awaitable(backend.put(key, structuredClone(value)));
  }

  async function index() {
    const value = await readJson(INDEX_KEY);
    return value && Array.isArray(value.boards) ? value : { activeId: null, boards: [] };
  }

  async function setIndex(value) {
    await writeJson(INDEX_KEY, value);
  }

  async function get(id) {
    if (!BOARD_ID.test(String(id || ''))) return null;
    const value = await readJson(BOARD_PREFIX + id);
    return value && typeof value === 'object' ? value : null;
  }

  async function all() {
    const current = await index();
    const boards = [];
    for (const meta of current.boards) {
      const board = await get(meta.id);
      if (board) boards.push(board);
    }
    return boards.sort((a, b) => -(a.updatedAt || 0) + (b.updatedAt || 0));
  }

  async function prune(keep) {
    const wanted = new Set(keep.filter((id) => BOARD_ID.test(String(id))));
    const current = await index();
    let removed = 0;
    for (const meta of current.boards) {
      if (!wanted.has(meta.id)) {
        await del(BOARD_PREFIX + meta.id);
        removed += 1;
      }
    }
    await setIndex({ ...current, boards: current.boards.filter((entry) => wanted.has(entry.id)) });
    return removed;
  }

  async function inboxIds() {
    const value = await readJson(INBOX_INDEX_KEY);
    return Array.isArray(value) ? value : [];
  }

  const store = {
    backend: domain ? 'storageDomain' : 'memory',

    run(job) {
      const result = chain.then(job);
      chain = result.catch(() => {});
      return result;
    },

    async sharing() {
      const value = await readJson(SHARING_KEY);
      if (!value || typeof value !== 'object') return { known: false, on: false };
      return { known: true, on: Boolean(value.on), at: value.at };
    },

    async setSharing(on) {
      await writeJson(SHARING_KEY, { on: Boolean(on), at: Date.now() });
      if (!on) {
        await prune([]);
        for (const id of await inboxIds()) await del(INBOX_PREFIX + id);
        await writeJson(INBOX_INDEX_KEY, []);
      }
      return store.sharing();
    },

    index,
    setIndex,

    async put(board) {
      const id = String(board?.id || '');
      if (!BOARD_ID.test(id)) return false;
      board = { ...board, syncRevision: crypto.randomUUID() };
      await writeJson(BOARD_PREFIX + id, board);
      const current = await index();
      const meta = {
        count: (board.items || []).filter((item) => item.kind === 'note').length,
        id,
        name: board.name,
        workspaceId: board.workspaceId || null,
        workspaceTitle: board.workspaceTitle || null,
        updatedAt: board.updatedAt,
      };
      const boards = current.boards.some((entry) => entry.id === id)
        ? current.boards.map((entry) => (entry.id === id ? meta : entry))
        : [...current.boards, meta];
      await setIndex({ ...current, boards });
      return board;
    },

    get,

    all,

    async remove(id) {
      if (!BOARD_ID.test(String(id || ''))) return false;
      const existed = (await get(id)) !== null;
      await del(BOARD_PREFIX + id);
      const current = await index();
      await setIndex({ ...current, boards: current.boards.filter((entry) => entry.id !== id) });
      return existed;
    },

    prune,

    async find(ref, workspaceId) {
      const needle = String(ref || '').trim().replace(/^@/, '');
      if (!needle) return null;
      const direct = await get(needle);
      if (direct && (!workspaceId || direct.workspaceId === workspaceId)) return direct;
      const boards = (await all()).filter(board => !workspaceId || board.workspaceId === workspaceId);
      const low = referenceKey(needle);
      const exact = boards.filter(board => referenceKey(board.name) === low);
      if (exact.length) return exact.length === 1 ? exact[0] : null;
      const starts = boards.filter((board) => referenceKey(board.name).startsWith(low));
      return starts.length === 1 ? starts[0] : null;
    },

    async pushInbox(entry) {
      const id = String(entry?.id || '');
      if (!ENTRY_ID.test(id)) return false;
      const list = await inboxIds();
      if (!list.includes(id)) list.push(id);
      if (list.length > MAX_INBOX) throw new Error('Whiteboard has 50 pending entries. Open the panel before sending more.');
      await writeJson(INBOX_PREFIX + id, entry);
      await writeJson(INBOX_INDEX_KEY, list);
      return true;
    },

    async inbox() {
      const ids = await inboxIds();
      const entries = [];
      for (const id of ids) {
        const entry = await readJson(INBOX_PREFIX + id);
        if (entry && typeof entry === 'object') entries.push(entry);
      }
      return entries.sort((a, b) => (a.at || 0) - (b.at || 0));
    },

    async ackInbox(id) {
      if (!ENTRY_ID.test(String(id || ''))) return false;
      const existed = (await readJson(INBOX_PREFIX + id)) !== null;
      await del(INBOX_PREFIX + id);
      await writeJson(INBOX_INDEX_KEY, (await inboxIds()).filter((entry) => entry !== id));
      return existed;
    },
  };

  return store;
}
