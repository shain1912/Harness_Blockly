import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { introspectModule } from '../src/introspect/introspect.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');

test('introspects functions, classes, methods; skips private; uses return annotations', async () => {
  const spec = await introspectModule('sample', { cwd: fixtures });
  assert.equal(spec.module, 'sample');
  const byName = (k, n) => spec.entries.find((e) => e.kind === k && e.name === n);

  const greet = byName('function', 'greet');
  assert.ok(greet, 'greet function present');
  assert.deepEqual(greet.params.map((p) => [p.name, p.hasDefault]), [['name', false], ['excited', true]]);

  assert.ok(byName('class', 'Counter'), 'Counter class present');
  const bump = spec.entries.find((e) => e.kind === 'method' && e.owner === 'Counter' && e.name === 'bump');
  assert.ok(bump, 'Counter.bump method present');
  assert.equal(bump.returns, true);                 // -> int
  const reset = spec.entries.find((e) => e.kind === 'method' && e.name === 'reset');
  assert.equal(reset.returns, false);               // -> None

  assert.equal(spec.entries.some((e) => e.name.startsWith('_')), false, 'no private members');
});

test('rejects an unimportable module with a clear error', async () => {
  await assert.rejects(introspectModule('definitely_not_a_real_module_xyz', { cwd: fixtures }), /import|not.*found|No module/i);
});
