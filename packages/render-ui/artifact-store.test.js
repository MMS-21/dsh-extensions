import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactId, artifactVersion, listArtifacts, readArtifact, resolveRevision, saveArtifact, saveRevision} from './src/artifact-store.js';
import {normalizeSpec} from './lib/validate.js';

test('only explicitly saved views reopen, and call IDs are scoped to their conversation', () => {
  const values = new Map();
  const storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const id = artifactId('first', 'same-call');
  const otherId = artifactId('second', 'same-call');
  const spec = normalizeSpec({lang:'root = Stack([])', placement:'artifact'});
  assert.deepEqual(listArtifacts(storage), []);
  assert.equal(readArtifact(id, storage), undefined);
  const saved = saveArtifact({id, title:'First view', spec, sessionId:'first'}, storage);
  assert.deepEqual(readArtifact(id, storage), saved);
  assert.equal(readArtifact(otherId, storage), undefined);
  assert.equal(saved.sessionId, undefined);
  assert.deepEqual(saveArtifact({id, title:'Duplicate click', spec}, storage), saved);
  assert.deepEqual(listArtifacts(storage), [saved]);
});

test('placement is validated and existing inline specs keep their stored format', () => {
  const lang = 'root = Stack([])';
  assert.equal(normalizeSpec({lang, placement:'artifact'}).placement, 'artifact');
  assert.deepEqual(normalizeSpec({lang, placement:'inline'}), normalizeSpec({lang}));
  const dashboard = {lang:'root = Dashboard([])', library:'dashboard'};
  assert.equal(normalizeSpec(dashboard).placement, 'artifact');
  assert.equal(normalizeSpec({...dashboard, placement:'inline'}).placement, undefined);
  assert.throws(() => normalizeSpec({lang, placement:'fullscreen'}), /placement/);
});

test('revision drafts preserve their base and only publish against the latest version', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const id = artifactId('original-chat', 'first-call');
  const spec = {...normalizeSpec({lang:'root = Stack([])'}), snapshot:{data:{value:5}}, selectionKeys:['office']};
  saveArtifact({id, title:'Saved view', spec, selection:{$office:'West'}}, storage);
  const revisionOf = JSON.stringify([id, 1]);
  const proposal = {
    id:artifactId('another-chat', 'proposal'),
    spec:normalizeSpec({lang:'root = Stack([TextContent("East comparison")])', revisionOf}),
    selection:{$office:'West'},
  };
  assert.equal(proposal.spec.placement, 'artifact');
  assert.deepEqual(resolveRevision(proposal.spec, storage).selection, {$office:'West'});
  assert.deepEqual(readArtifact(id, storage).spec, spec);
  const latest = saveRevision(proposal, storage);
  assert.equal(latest.id, id);
  assert.equal(latest.version, 2);
  assert.deepEqual(latest.spec.snapshot, spec.snapshot);
  assert.deepEqual(latest.selection, {$office:'West'});
  assert.deepEqual(artifactVersion(latest, 1).spec, spec);
  assert.deepEqual(saveRevision(proposal, storage), latest);
  assert.throws(() => saveRevision({...proposal, id:'different proposal'}, storage), /newer revision/);
  assert.throws(() => normalizeSpec({lang:spec.lang, revisionOf:'invalid'}), /revisionOf/);
});
