import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { blockify } from '../src/blockify.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('blockify introspects + defines + builds toolbox, and calls workspace.updateToolbox', async () => {
  const Blockly = { Blocks: {}, Python: { forBlock: {} } };
  let updated = null;
  const ws = { updateToolbox: (tb) => { updated = tb; } };
  const { spec, types, toolbox } = await blockify(Blockly, 'sample', { cwd: fixtures, workspace: ws });
  assert.equal(spec.module, 'sample');
  assert.ok(types.includes('lib_sample__greet'));
  assert.ok(Blockly.Blocks['lib_sample__greet']);
  assert.equal(updated, toolbox);
  assert.equal(toolbox.kind, 'categoryToolbox');
});
