// Form-state persistence for OpenUI presentations.
//
// A presentation's interactive state (form fields, selections, filters) is
// keyed by a stable hash of its OpenUI Lang source so a restored response
// rehydrates the same state after a session reload. Storage is per-browser
// and best-effort: failures must never break rendering.

export const STORAGE_PREFIX = 'dsh-openui-formstate-';

/** Stable 32-bit hash of the Lang source, independent of object identity. */
export function hashSpec(lang) {
  let h = 0;
  const s = String(lang || '');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return 'h' + (h >>> 0).toString(16);
}

export function storageKeyFor(lang) {
  return STORAGE_PREFIX + hashSpec(lang);
}

/** Read persisted state; returns undefined when absent or corrupt. */
export function loadFormState(key, storage) {
  try {
    const raw = (storage ?? window.localStorage).getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

/** Persist state, or clear the entry when value is undefined. */
export function saveFormState(key, value, storage) {
  try {
    if (value === undefined) (storage ?? window.localStorage).removeItem(key);
    else (storage ?? window.localStorage).setItem(key, JSON.stringify(value));
  } catch {}
}
