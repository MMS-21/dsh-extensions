import test from 'node:test';
import assert from 'node:assert/strict';
import {hashSpec, storageKeyFor, loadFormState, saveFormState, STORAGE_PREFIX} from './src/form-state.js';

test('form-state key is stable for identical Lang and differs for changed Lang', () => {
  const a = 'root = Stack([Form("f", Input("x", "1"))])';
  const b = 'root = Stack([Form("f", Input("x", "2"))])';
  assert.equal(hashSpec(a), hashSpec(a));
  assert.notEqual(hashSpec(a), hashSpec(b));
  assert.equal(hashSpec(undefined), hashSpec(''));
  assert.match(storageKeyFor(a), new RegExp('^' + STORAGE_PREFIX));
});

test('form state round-trips through storage and clears on undefined', () => {
  const store = new Map();
  const storage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const key = storageKeyFor('root = Stack([Form("f", Input("x", "1"))])');
  assert.equal(loadFormState(key, storage), undefined);
  saveFormState(key, {x: 'typed'}, storage);
  assert.deepEqual(loadFormState(key, storage), {x: 'typed'});
  saveFormState(key, undefined, storage);
  assert.equal(loadFormState(key, storage), undefined);
});

test('corrupt or throwing storage never breaks rendering', () => {
  assert.equal(loadFormState('k', {getItem() { throw new Error('denied'); }}), undefined);
  assert.doesNotThrow(() => saveFormState('k', {a: 1}, {setItem() { throw new Error('denied'); }}));
  assert.equal(loadFormState('k', {getItem: () => '{not json'}), undefined);
});
