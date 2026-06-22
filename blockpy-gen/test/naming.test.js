import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockType } from '../src/blocks/naming.js';

test('function type', () => {
  assert.equal(blockType('PIL.Image', { kind: 'function', name: 'open' }), 'lib_PIL_Image__open');
});
test('class type', () => {
  assert.equal(blockType('PIL.Image', { kind: 'class', name: 'Image' }), 'lib_PIL_Image__Image__new');
});
test('method type includes owner', () => {
  assert.equal(blockType('PIL.Image', { kind: 'method', owner: 'Image', name: 'save' }), 'lib_PIL_Image__Image__save__m');
});
test('deterministic', () => {
  const e = { kind: 'function', name: 'open' };
  assert.equal(blockType('PIL.Image', e), blockType('PIL.Image', e));
});
