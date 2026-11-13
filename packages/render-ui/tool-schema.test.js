import test from 'node:test';
import assert from 'node:assert/strict';
import {validateJsonSchemaValue} from './lib/tool-schema.js';

test('schema validation accepts conforming arguments', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['lang'],
    properties: {
      lang: { type: 'string', minLength: 1 },
      library: { type: 'string', enum: ['standard', 'dashboard'] },
      title: { type: 'string', maxLength: 200 },
      count: { type: 'integer', minimum: 0 },
      tags: { type: 'array', items: { type: 'string' } },
    },
  };
  assert.deepEqual(validateJsonSchemaValue(schema, {lang: 'root = Stack([])', library: 'dashboard', count: 3, tags: ['a']}), []);
  assert.deepEqual(validateJsonSchemaValue(undefined, {any: 'thing'}), []);
});

test('schema validation reports type, required, enum and bound violations', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['lang'],
    properties: {
      lang: { type: 'string' },
      library: { type: 'string', enum: ['standard', 'dashboard'] },
      count: { type: 'integer', minimum: 1, maximum: 9 },
      tags: { type: 'array', items: { type: 'string' } },
      nested: { type: 'object', properties: { flag: { type: 'boolean' } }, additionalProperties: false },
    },
  };
  const violations = validateJsonSchemaValue(schema, {
    lang: 7,
    library: 'other',
    count: 0,
    tags: ['ok', 3],
    extra: true,
    nested: {flag: 'yes', other: 1},
  });
  const joined = violations.join('\n');
  assert.match(joined, /lang: expected string/);
  assert.match(joined, /library: expected one of/);
  assert.match(joined, /count: must be >= 1/);
  assert.match(joined, /tags\[1\]: expected string/);
  assert.match(joined, /extra: is not an allowed property/);
  assert.match(joined, /nested\.flag: expected boolean/);
  assert.match(joined, /nested\.other: is not an allowed property/);
});

test('schema validation keeps unsafe keys out of the path', () => {
  const violations = validateJsonSchemaValue(
    {type: 'object', properties: {['__proto__']: {type: 'string'}}},
    {['__proto__']: 1},
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /__proto__/);
});
