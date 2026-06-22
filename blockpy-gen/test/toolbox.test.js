import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildToolbox } from '../src/blocks/toolbox.js';

const spec = { module: 'PIL.Image', entries: [
  { kind: 'function', name: 'open', params: [], returns: true },
  { kind: 'class', name: 'Image', params: [], returns: true },
  { kind: 'method', owner: 'Image', name: 'save', params: [], returns: false },
  { kind: 'method', owner: 'Image', name: 'resize', params: [], returns: true },
] };

test('toolbox has a functions category and a per-class category', () => {
  const tb = buildToolbox(spec);
  assert.equal(tb.kind, 'categoryToolbox');
  const names = tb.contents.map((c) => c.name);
  assert.ok(names.includes('PIL.Image functions'));
  assert.ok(names.includes('Image'));
});

test('class category contains the constructor + its methods', () => {
  const tb = buildToolbox(spec);
  const cls = tb.contents.find((c) => c.name === 'Image');
  const types = cls.contents.map((b) => b.type);
  assert.deepEqual(types, ['lib_PIL_Image__Image__new', 'lib_PIL_Image__Image__save__m', 'lib_PIL_Image__Image__resize__m']);
});

test('every block ref is a {kind:block,type}', () => {
  const tb = buildToolbox(spec);
  for (const c of tb.contents) for (const b of c.contents) { assert.equal(b.kind, 'block'); assert.equal(typeof b.type, 'string'); }
});
