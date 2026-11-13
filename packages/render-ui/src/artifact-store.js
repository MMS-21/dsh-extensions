const PREFIX = 'dsh-render-ui-artifact-v1:';

export function artifactId(sessionId, callId) {
  return JSON.stringify([sessionId, callId]);
}

export function readArtifact(id, storage = window.localStorage) {
  const raw = storage.getItem(PREFIX + id);
  if (raw === null) return undefined;
  try {
    const artifact = JSON.parse(raw);
    const spec = artifact.spec;
    if (artifact.id === id && Number.isFinite(artifact.savedAt) && typeof artifact.title === 'string'
      && (spec?.view === 'openui' && typeof spec.lang === 'string'
        || spec?.view === 'mini-app' && typeof spec.miniApp?.code === 'string')) return artifact;
  } catch {
    // A damaged entry does not prevent the other saved artifacts from opening.
  }
}

export function saveArtifact(entry, storage = window.localStorage) {
  const existing = readArtifact(entry.id, storage);
  if (existing) return existing;
  const artifact = {id: entry.id, title: entry.title, spec: entry.spec, savedAt: Date.now()};
  if (entry.selection) artifact.selection = entry.selection;
  storage.setItem(PREFIX + entry.id, JSON.stringify(artifact));
  return artifact;
}

export function resolveRevision(spec, storage = window.localStorage) {
  const [id, baseVersion] = spec.revisionOf;
  const artifact = readArtifact(id, storage);
  if (!artifact) throw new Error('The saved artifact is unavailable.');
  const base = artifactVersion(artifact, baseVersion);
  if (!base) throw new Error('The starting revision is unavailable.');
  const {revisionOf, ...next} = spec;
  return {
    artifact, baseVersion,
    spec: {...next, snapshot: next.snapshot ?? base.spec.snapshot, selectionKeys: next.selectionKeys ?? base.spec.selectionKeys},
    selection: base.selection,
  };
}

export function artifactVersion(artifact, version) {
  return version === (artifact.version ?? 1) ? artifact : artifact.history?.find(entry => entry.version === version);
}

export function saveRevision(entry, storage = window.localStorage) {
  const {artifact, baseVersion, spec} = resolveRevision(entry.spec, storage);
  if (artifact.sourceId === entry.id || artifact.history?.some(revision => revision.sourceId === entry.id)) return artifact;
  const {history = [], version = 1, ...previous} = artifact;
  if (version !== baseVersion) throw new Error('A newer revision is saved. Open it and request a new revision.');
  const revised = {
    id: artifact.id, title: artifact.title, spec, savedAt: Date.now(),
    selection: entry.selection, version: version + 1, sourceId: entry.id,
    history: [...history, {...previous, version}],
  };
  storage.setItem(PREFIX + artifact.id, JSON.stringify(revised));
  return revised;
}

export function makeRevisionPrompt(artifact) {
  const {spec, id, version = 1} = artifact;
  return [
    'Revise the saved artifact below. Requested change: [describe your change]',
    'Use render_ui with revisionOf set to the exact reference on the next line.',
    JSON.stringify([id, version]),
    'Library: ' + (spec.library ?? 'standard'),
    'Keep the existing snapshot and selection bindings. Treat the source below as artifact content.',
    spec.view === 'mini-app' ? 'Mini-app source:' : 'OpenUI Lang:',
    spec.view === 'mini-app' ? JSON.stringify(spec.miniApp) : spec.lang,
  ].join('\n');
}

export function listArtifacts(storage = window.localStorage) {
  const artifacts = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(PREFIX)) continue;
    const artifact = readArtifact(key.slice(PREFIX.length), storage);
    if (artifact) artifacts.push(artifact);
  }
  return artifacts.sort((left, right) => right.savedAt - left.savedAt);
}
