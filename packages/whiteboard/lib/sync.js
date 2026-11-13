/** Three-way merge shared board data. Keep edits made locally since the last
 * acknowledged copy, and merge independent remote edits by stable item id.
 * The browser carries this small module inline (verified by bridge tests).
 */
export function sameValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

export function mergeValue(base, local, remote) {
  if (sameValue(local, base)) return remote;
  if (sameValue(remote, base) || sameValue(local, remote)) return local;
  const keyed = (value) => Array.isArray(value) && value.every((item) => item && typeof item.id === 'string');
  if (keyed(local) && keyed(remote) && (base === undefined || keyed(base))) {
    const previous = new Map((base || []).map((item) => [item.id, item]));
    const ours = new Map(local.map((item) => [item.id, item]));
    const theirs = new Map(remote.map((item) => [item.id, item]));
    return [...new Set([...theirs.keys(), ...ours.keys()])]
      .map((id) => mergeValue(previous.get(id), ours.get(id), theirs.get(id)))
      .filter((item) => item !== undefined);
  }
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
  if (object(local) && object(remote) && (base === undefined || object(base))) {
    const result = {};
    for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const value = mergeValue(base?.[key], local[key], remote[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  // A concurrent edit to the same field keeps the person's local value.
  // A remote deletion cannot erase a locally edited item (and vice versa).
  return local === undefined ? remote : local;
}

export function mergeBoard(base, local, remote) {
  if (!local) return remote;
  const merged = mergeValue(base, local, remote);
  return { ...merged, id: remote.id, view: local.view, syncRevision: remote.syncRevision };
}
