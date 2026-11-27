// Only quota metadata leaves this module. The access token is never returned.
export const QUOTA_URL = 'https://chatgpt.com/backend-api/wham/usage';
export function parseQuota(body, now = Date.now()) {
  const limits = body?.rate_limit ?? body?.rate_limits?.rate_limit ?? body?.rateLimits?.codex ?? body?.rateLimits;
  const windows = [];
  for (const [name, item] of [['Primary',limits?.primary_window ?? limits?.primary],['Secondary',limits?.secondary_window ?? limits?.secondary]]) {
    if (!item || typeof (item.used_percent ?? item.usedPercent) !== 'number' || !Number.isFinite(item.used_percent ?? item.usedPercent) || (item.used_percent ?? item.usedPercent) < 0 || (item.used_percent ?? item.usedPercent) > 100) continue;
    const rawSeconds = item.limit_window_seconds ?? (Number.isSafeInteger(item.windowDurationMins) ? item.windowDurationMins * 60 : null);
    const seconds = Number.isSafeInteger(rawSeconds) && rawSeconds > 0 ? rawSeconds : null;
    const rawReset = item.reset_at ?? item.resetsAt;
    const reset = Number.isSafeInteger(rawReset) && rawReset > 0 && rawReset < 4102444800 ? rawReset * 1000 : null;
    const label = seconds === 18000 ? '5 hours' : seconds === 604800 ? 'Weekly' : seconds && seconds % 3600 === 0 ? `${seconds / 3600} hours` : name;
    windows.push({label, usedPercent: item.used_percent ?? item.usedPercent, resetAt: reset, durationSeconds: seconds});
  }
  return {status:windows.length ? 'ok' : 'unavailable', fetchedAt:now, windows};
}
export function emptyQuota(status) {return {status, fetchedAt:Date.now(), windows:[]};}
export async function readQuota(credential, request = globalThis.fetch) {
  if (credential?.type !== 'oauth' || typeof credential.access !== 'string' || !credential.access) return emptyQuota('signed-out');
  if (!Number.isFinite(credential.expires) || credential.expires <= Date.now()) return emptyQuota('expired');
  try {
    const headers = {Authorization:`Bearer ${credential.access}`, Accept:'application/json', Origin:'https://chatgpt.com', Referer:'https://chatgpt.com/'};
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
