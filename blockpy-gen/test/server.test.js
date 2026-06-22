import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createBlockifyServer } from '../src/server/blockify.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function withServer(opts, fn) {
  const server = createBlockifyServer({ cwd: fixtures, ...opts });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  try { return await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

test('GET /blockify?module=sample returns a LibrarySpec', async () => {
  await withServer({ allow: ['sample'] }, async (base) => {
    const res = await fetch(`${base}/blockify?module=sample`);
    assert.equal(res.status, 200);
    const spec = await res.json();
    assert.equal(spec.module, 'sample');
    assert.ok(spec.entries.some((e) => e.name === 'greet'));
  });
});

test('module not in allowlist -> 403', async () => {
  await withServer({ allow: ['numpy'] }, async (base) => {
    const res = await fetch(`${base}/blockify?module=sample`);
    assert.equal(res.status, 403);
  });
});

test('missing module -> 400', async () => {
  await withServer({ allow: ['sample'] }, async (base) => {
    assert.equal((await fetch(`${base}/blockify`)).status, 400);
  });
});

test('second call is a cache hit (introspect runs once)', async () => {
  let calls = 0;
  await withServer({ allow: ['sample'], introspect: async (n, o) => { calls++; return { module: n, entries: [] }; } }, async (base) => {
    await fetch(`${base}/blockify?module=sample`);
    await fetch(`${base}/blockify?module=sample`);
    assert.equal(calls, 1);
  });
});
