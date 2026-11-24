import { createHash } from 'node:crypto';
import { emptyQuota, readQuota } from './quota-core.mjs';
export function createQuotaService(readRecord, {request = globalThis.fetch, now = Date.now} = {}) {
  let cache = null, pending = null, generation = 0, identity = null;
  function change(next) {
    if (identity !== next) { identity = next; generation++; cache = null; pending = null; }
  }
  return {
    async query() {
      let record;
      try { record = await readRecord(); } catch { change(null); return emptyQuota('vault-locked'); }
      const c = record?.kind === 'grant' ? record.payload : undefined;
      if (c?.type !== 'oauth' || typeof c.access !== 'string' || !c.access || c.access.length > 65536) {
        change(null); return emptyQuota('signed-out');
      }
      if (!Number.isFinite(c.expires) || c.expires <= now()) { change(null); return emptyQuota('expired'); }
      const key = createHash('sha256').update(JSON.stringify([c.access, typeof c.accountId === 'string' ? c.accountId : null])).digest('hex');
      change(key);
      if (cache && now() - cache.at < 60000) return cache.value;
      if (pending) return pending;
      const epoch = generation;
      const task = readQuota({type:'oauth',access:c.access,expires:c.expires,accountId:c.accountId}, request).then(value => {
        if (epoch !== generation) return emptyQuota('unavailable');
        cache = {at:now(), value}; return value;
      }).finally(() => { if (pending === task) pending = null; });
      pending = task; return task;
    }
  };
}
