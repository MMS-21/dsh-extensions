// Only quota metadata leaves this module. The access token is never returned.
export const QUOTA_URL = 'https://chatgpt.com/backend-api/wham/usage';
export function parseQuota(body, now = Date.now()) {
  const windows = [];
  for (const [name, item] of [['Primary',body?.rate_limit?.primary_window],['Secondary',body?.rate_limit?.secondary_window]]) {
    if (!item || typeof item.used_percent !== 'number' || !Number.isFinite(item.used_percent) || item.used_percent < 0 || item.used_percent > 100) continue;
    const seconds = Number.isSafeInteger(item.limit_window_seconds) && item.limit_window_seconds > 0 ? item.limit_window_seconds : null;
    const reset = Number.isSafeInteger(item.reset_at) && item.reset_at > 0 && item.reset_at < 4102444800 ? item.reset_at * 1000 : null;
    const label = seconds === 18000 ? '5 hours' : seconds === 604800 ? 'Weekly' : seconds && seconds % 3600 === 0 ? `${seconds / 3600} hours` : name;
    windows.push({label, usedPercent: item.used_percent, resetAt: reset, durationSeconds: seconds});
  }
  return {status:windows.length ? 'ok' : 'unavailable', fetchedAt:now, windows};
}
export function emptyQuota(status) {return {status, fetchedAt:Date.now(), windows:[]};}
export async function readQuota(credential, request = globalThis.fetch) {
  if (credential?.type !== 'oauth' || typeof credential.access !== 'string' || !credential.access) return emptyQuota('signed-out');
  if (typeof credential.expires !== 'number' || credential.expires <= Date.now()) return emptyQuota('expired');
  try {
    const headers = {Authorization:`Bearer ${credential.access}`, Accept:'application/json'};
    if (typeof credential.accountId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(credential.accountId)) headers['ChatGPT-Account-Id'] = credential.accountId;
    const response = await request(QUOTA_URL,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'});
    if (!response.ok) {await response.body?.cancel(); return emptyQuota(response.status === 401 ? 'expired' : response.status === 429 ? 'rate-limited' : 'unavailable');}
    // Bound untrusted response size; never log response bodies or errors.
    const reader = response.body?.getReader();
    if (!reader) return emptyQuota('unavailable');
    let size=0; const chunks=[];
    try {for (;;) {const {done,value}=await reader.read(); if(done)break;size+=value.byteLength;if(size>262144){await reader.cancel();return emptyQuota('unavailable');}chunks.push(Buffer.from(value));}}
    finally {reader.releaseLock();}
    return parseQuota(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {return emptyQuota('unavailable');}
}
