import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { introspectModule } from '../src/introspect/introspect.js';
import { defineBlocks } from '../src/blocks/define.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

// Full chain: introspect -> defineBlocks -> the generated code is correct for fn AND method.
test('end-to-end: generated code is correct for a function and a method', async () => {
  const spec = await introspectModule('sample', { cwd: fixtures });
  const Blockly = { Blocks: {}, Python: { forBlock: {} } };
  defineBlocks(Blockly, spec);
  const gen = { ORDER_ATOMIC: 0, ORDER_NONE: 99, valueToCode: (_b, n) => ({ RECV: 'c', ARG0: '5' }[n] || '') };

  const fn = Blockly.Python.forBlock['lib_sample__greet'];
  assert.deepEqual(fn({}, gen), ['sample.greet(5)', 0]);              // module.func, value form

  const m = Blockly.Python.forBlock['lib_sample__Counter__bump__m'];
  assert.deepEqual(m({}, gen), ['c.bump(5)', 0]);                     // receiver.method, NOT sample.bump(c,5)
});
