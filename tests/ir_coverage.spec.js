const { test, expect } = require('@playwright/test');

// raw=0 progress harness. The closed CPython-3.12 ast node set is enumerated from the
// TARGET runtime (Pyodide) and checked against NODE_POLICY. These GREEN tests assert
// POLICY-level properties (every node categorized; DB/SUGAR is never over-claimed). They
// do NOT assert raw=0 is *achieved* — that is the `fixme` definition-of-done (no PENDING),
// which is the real worklist completion signal. Unimplemented (PENDING) nodes fail loudly
// during conversion (see ir_unit), so gaps are explicit, never silently masked.

test.describe('raw=0 coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__pyodide && !!window.BlockPyIR,
      null, { timeout: 180000 });
  });

  async function pyodideNodeClasses(page) {
    return page.evaluate(async () => {
      const py = window.__pyodide;
      py.runPython(
        'import ast, json\n' +
        '_names = json.dumps([n for n in dir(ast) ' +
        'if isinstance(getattr(ast, n), type) and issubclass(getattr(ast, n), ast.AST)])');
      return JSON.parse(py.globals.get('_names'));
    });
  }

  test('policy totality: every CPython-3.12 ast node is categorized (no uncategorized node)', async ({ page }) => {
    const nodes = await pyodideNodeClasses(page);
    const policy = await page.evaluate(() => window.BlockPyIR.NODE_POLICY);
    const uncategorized = nodes.filter((n) => !(n in policy));
    expect(uncategorized, `nodes with no policy (would fall to raw): ${uncategorized.join(', ')}`)
      .toEqual([]);
  });

  test('NODE_POLICY has no entries unknown to the 3.12 runtime', async ({ page }) => {
    const nodes = new Set(await pyodideNodeClasses(page));
    const { policy, optional } = await page.evaluate(() => ({
      policy: window.BlockPyIR.NODE_POLICY,
      optional: window.BlockPyIR.OPTIONAL_DEPRECATED,
    }));
    // Deprecated constant aliases may or may not appear in dir(ast) depending on the build;
    // an absent one is not "stale" — only non-deprecated entries must exist in the runtime.
    const opt = new Set(optional);
    const stale = Object.keys(policy).filter((n) => !nodes.has(n) && !opt.has(n));
    expect(stale, `NODE_POLICY entries absent from Pyodide 3.12: ${stale.join(', ')}`).toEqual([]);
  });

  test('handlers only exist for DB/SUGAR nodes (no stray handlers)', async ({ page }) => {
    const { policy, handled } = await page.evaluate(() => ({
      policy: window.BlockPyIR.NODE_POLICY,
      handled: [...window.BlockPyIR.__handled],
    }));
    const stray = handled.filter((n) => policy[n] !== 'DB' && policy[n] !== 'SUGAR');
    expect(stray, `handlers for non-DB/SUGAR nodes: ${stray.join(', ')}`).toEqual([]);
  });

  // ACTIVE gate: a node is only ever marked DB/SUGAR once it truly has a block handler.
  // This prevents the policy from advertising raw=0 coverage a node does not yet have —
  // unimplemented nodes stay PENDING. Each slice flips PENDING -> DB/SUGAR together with
  // adding the handler, keeping this green.
  test('every DB/SUGAR node has a block handler (no over-claimed coverage)', async ({ page }) => {
    const { policy, handled } = await page.evaluate(() => ({
      policy: window.BlockPyIR.NODE_POLICY,
      handled: window.BlockPyIR.__handled ? [...window.BlockPyIR.__handled] : [],
    }));
    const h = new Set(handled);
    const overclaimed = Object.entries(policy)
      .filter(([, p]) => p === 'DB' || p === 'SUGAR')
      .map(([n]) => n)
      .filter((n) => !h.has(n));
    expect(overclaimed, `DB/SUGAR without a handler: ${overclaimed.join(', ')}`).toEqual([]);
  });

  // Worklist definition-of-done: no PENDING nodes remain (every planned node implemented).
  // RED until the worklist completes — marked fixme so it tracks progress without breaking
  // the suite; the message prints the remaining worklist. Remove `.fixme` when it goes green.
  test.fixme('no PENDING nodes remain (node-family worklist complete)', async ({ page }) => {
    const policy = await page.evaluate(() => window.BlockPyIR.NODE_POLICY);
    const pending = Object.entries(policy).filter(([, p]) => p === 'PENDING').map(([n]) => n);
    expect(pending, `remaining worklist (${pending.length}): ${pending.join(', ')}`).toEqual([]);
  });
});
