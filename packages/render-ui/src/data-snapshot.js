export const SNAPSHOT_QUERY = 'ui_snapshot';

export function readSnapshot(spec, args) {
  if (!spec.snapshot?.data) throw new Error('This view has no attached data snapshot.');
  if (!args || Object.keys(args).length !== 0) throw new Error('ui_snapshot takes no arguments.');
  return spec.snapshot.data;
}

export function captureSelection(spec, state) {
  const selection = {};
  for (const key of spec.selectionKeys ?? []) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)
      || key === 'constructor' || key === 'prototype') continue;
    const binding = '$' + key;
    if (!state || !Object.hasOwn(state, binding)) continue;
    const value = state[binding];
    if (typeof value === 'boolean' || Number.isFinite(value)
      || (typeof value === 'string' && value.length <= 120)) selection[binding] = value;
  }
  return selection;
}

export function createSelection(spec, initial = {}) {
  if (!spec.selectionKeys?.length) return undefined;
  return {
    current: captureSelection(spec, initial),
    update(state) { this.current = captureSelection(spec, state ?? {}); },
  };
}
