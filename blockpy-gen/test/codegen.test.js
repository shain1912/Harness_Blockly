import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGenerator } from '../src/blocks/codegen.js';

// minimal fake Python generator: ARG/RECV inputs resolved from a map.
function fakeGen(values) {
  return { ORDER_ATOMIC: 0, ORDER_NONE: 99, valueToCode: (_b, name) => values[name] || '' };
}
const block = {};

test('function call: module.func(args)', () => {
  const g = makeGenerator('PIL.Image', { kind: 'function', name: 'open',
    params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: true });
  assert.deepEqual(g(block, fakeGen({ ARG0: "'a.png'" })), ["PIL.Image.open('a.png')", 0]);
});

test('method call: receiver.method(args[1:]), receiver from RECV not args', () => {
  const g = makeGenerator('PIL.Image', { kind: 'method', owner: 'Image', name: 'save',
    params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: false });
  const code = g(block, fakeGen({ RECV: 'img', ARG0: "'out.png'" }));
  assert.equal(code, "img.save('out.png')\n");           // statement form, RECV is the receiver
});

test('optional param left empty is omitted; keyword param emits name=value', () => {
  const g = makeGenerator('m', { kind: 'function', name: 'f',
    params: [{ name: 'a', kind: 'positional', hasDefault: false }, { name: 'mode', kind: 'keyword', hasDefault: true }], returns: true });
  assert.deepEqual(g(block, fakeGen({ ARG0: 'x' })), ['m.f(x)', 0]);                 // mode omitted
  assert.deepEqual(g(block, fakeGen({ ARG0: 'x', ARG1: "'r'" })), ["m.f(x, mode='r')", 0]);
});

test('constructor: module.Class(args), value form', () => {
  const g = makeGenerator('m', { kind: 'class', name: 'C', params: [], returns: true });
  assert.deepEqual(g(block, fakeGen({})), ['m.C()', 0]);
});

test('vararg -> *value, kwarg -> **value, ordered after keyword args (valid Python)', () => {
  const g = makeGenerator('m', { kind: 'function', name: 'f', params: [
    { name: 'a', kind: 'positional', hasDefault: false },
    { name: 'opt', kind: 'keyword', hasDefault: true },
    { name: 'args', kind: 'vararg', hasDefault: false },
    { name: 'kw', kind: 'kwarg', hasDefault: false },
  ], returns: true });
  // all present: positional, *args, keyword, **kwargs — splats keep their prefix
  assert.deepEqual(g(block, fakeGen({ ARG0: 'a', ARG1: '1', ARG2: 'rest', ARG3: 'd' })),
    ['m.f(a, opt=1, *rest, **d)', 0]);
  // empty splats are simply omitted (not rendered as positional None)
  assert.deepEqual(g(block, fakeGen({ ARG0: 'a' })), ['m.f(a)', 0]);
});

test('required keyword-only left empty emits name=None (never a trailing positional)', () => {
  const g = makeGenerator('m', { kind: 'function', name: 'f', params: [
    { name: 'a', kind: 'positional', hasDefault: false },
    { name: 'ko', kind: 'keyword', hasDefault: false },
  ], returns: true });
  assert.deepEqual(g(block, fakeGen({ ARG0: 'a' })), ['m.f(a, ko=None)', 0]);
});
