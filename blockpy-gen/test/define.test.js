import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineBlocks } from '../src/blocks/define.js';

// fake Blockly that records init shape via a recording block proxy.
function fakeBlockly() {
  return { Blocks: {}, Python: { forBlock: {} } };
}
function runInit(Blockly, type) {
  const shape = { fields: [], inputs: [], output: false, statement: false };
  const block = {
    appendDummyInput: () => ({ appendField: (f) => { shape.fields.push(f); return block.__chain; } }),
    appendValueInput: (n) => { shape.inputs.push(n); return { appendField: () => {} }; },
    setOutput: () => { shape.output = true; },
    setPreviousStatement: () => { shape.statement = true; },
    setNextStatement: () => {},
    setColour: () => {}, setTooltip: () => {},
  };
  block.__chain = { appendField: () => {} };
  Blockly.Blocks[type].init.call(block);
  return shape;
}

const spec = { module: 'PIL.Image', entries: [
  { kind: 'function', name: 'open', params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: true },
  { kind: 'method', owner: 'Image', name: 'save', params: [{ name: 'fp', kind: 'positional', hasDefault: false }], returns: false },
] };

test('registers a block + generator per entry', () => {
  const B = fakeBlockly();
  const { types } = defineBlocks(B, spec);
  assert.equal(types.length, 2);
  for (const t of types) { assert.ok(B.Blocks[t]); assert.equal(typeof B.Python.forBlock[t], 'function'); }
});

test('function block: output, one ARG input, no RECV', () => {
  const B = fakeBlockly();
  defineBlocks(B, spec);
  const s = runInit(B, 'lib_PIL_Image__open');
  assert.equal(s.output, true);
  assert.deepEqual(s.inputs, ['ARG0']);
});

test('method block: statement, RECV input first then ARG inputs', () => {
  const B = fakeBlockly();
  defineBlocks(B, spec);
  const s = runInit(B, 'lib_PIL_Image__Image__save__m');
  assert.equal(s.statement, true);
  assert.deepEqual(s.inputs, ['RECV', 'ARG0']);
});

test('invalid spec throws', () => {
  assert.throws(() => defineBlocks(fakeBlockly(), { module: '1bad', entries: [] }), /module/);
});
