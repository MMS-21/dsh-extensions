// Allowlist DTO fields instead of exposing a provider's response or credentials.
const statuses = new Set(['ok','unavailable','signed-out','expired','vault-locked','rate-limited']);
const isNumber = x => typeof x === 'number' && Number.isFinite(x);
export function parseSnapshot(value) {
  if (!value || !statuses.has(value.status) || !isNumber(value.fetchedAt) || !Array.isArray(value.windows) || value.windows.length > 2) throw new Error('Invalid quota snapshot');
  const windows = value.windows.map(w => {
    if (!w || typeof w.label !== 'string' || !/^(Primary|Secondary|Weekly|[0-9]{1,15} hours)$/.test(w.label) || !isNumber(w.usedPercent) || w.usedPercent < 0 || w.usedPercent > 100 || !(w.resetAt === null || (Number.isSafeInteger(w.resetAt) && w.resetAt > 0)) || !(w.durationSeconds === null || (Number.isSafeInteger(w.durationSeconds) && w.durationSeconds > 0))) throw new Error('Invalid quota window');
    return { label:w.label, usedPercent:w.usedPercent, resetAt:w.resetAt, durationSeconds:w.durationSeconds };
  });
  if ((value.status === 'ok') !== (windows.length > 0)) throw new Error('Invalid quota status');
  return {status:value.status,fetchedAt:value.fetchedAt,windows};
}
export const quotaSchema = { parse:parseSnapshot };
