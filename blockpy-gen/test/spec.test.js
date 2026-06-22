import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec } from '../src/spec.js';

const ok = { module: 'PIL.Image', entries: [
  { kind: 'function', name: 'open', params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: true },
  { kind: 'method', owner: 'Image', name: 'save', params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: false },
] };

test('valid spec returns null', () => { assert.equal(validateSpec(ok), null); });
test('rejects non-dotted-identifier module', () => { assert.match(validateSpec({ module: '1bad', entries: [] }), /module/); });
test('rejects unknown entry kind', () => {
  assert.match(validateSpec({ module: 'm', entries: [{ kind: 'macro', name: 'x', params: [], returns: true }] }), /kind/);
});
test('rejects method without owner', () => {
  assert.match(validateSpec({ module: 'm', entries: [{ kind: 'method', name: 'x', params: [], returns: true }] }), /owner/);
});
test('rejects duplicate param', () => {
  assert.match(validateSpec({ module: 'm', entries: [{ kind: 'function', name: 'f', params: [
    { name: 'a', kind: 'positional', hasDefault: false }, { name: 'a', kind: 'positional', hasDefault: false }], returns: true }] }), /duplicate/);
});
test('rejects bad param kind', () => {
  assert.match(validateSpec({ module: 'm', entries: [{ kind: 'function', name: 'f', params: [
    { name: 'a', kind: 'splat', hasDefault: false }], returns: true }] }), /param kind/);
});
