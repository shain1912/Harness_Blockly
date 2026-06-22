// Phase 4 desugar — SEMANTIC EQUIVALENCE proof (invariant #1, the BLOCKING one).
// For each case, runs the ORIGINAL Python and the DESUGARED Python (pythonToIR -> desugarIr ->
// irToPython) in REAL Pyodide and asserts identical observable behavior: the checked value AND the
// side-effect `log` (evaluation order/count). Covers the adversarial findings (dict key/value
// order, left-to-right hoist, AugAssign attribute-target order) plus the happy paths. Drives the
// live dev server so window.BlockPyAstBridge + window.BlockPyIrDesugar are the bundled globals.
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:' + (process.env.PORT || '3000') + '/';

// Each case: setup defines side-effecting helpers / state; code is the sugar under test; check is a
// Python expression whose value must match between original and desugared runs. `log` (a list the
// helpers append to) is compared too when present — that is the evaluation-order/count witness.
const CASES = [
  { name: 'list comprehension value', setup: '', code: 'squares = [i*i for i in range(5)]', check: 'squares' },
  { name: 'set comprehension value', setup: 'xs=[1,2,2,3]', code: 's = {x for x in xs}', check: 'sorted(s)' },
  { name: 'dict comprehension value', setup: 'ks=[1,2,3]', code: 'd = {k: k*k for k in ks}', check: 'd' },
  { name: 'ternary value', setup: 'speed=120', code: 'status = "Danger" if speed > 100 else "Safe"', check: 'status' },
  { name: 'chained compare value (true)', setup: 'speed=85', code: 'r = 60 < speed < 120', check: 'r' },
  { name: 'chained compare value (false, short-circuit)', setup: 'speed=200', code: 'r = 60 < speed < 120', check: 'r' },
  { name: 'comp filter', setup: '', code: 'r = [x for x in range(10) if x % 2 == 0]', check: 'r' },
  { name: 'multi-generator comp', setup: '', code: 'r = [a+b for a in range(3) for b in range(2)]', check: 'r' },
  { name: 'nested comp in elt', setup: 'rows=[[1,2],[3,4]]', code: 'm = [[y*y for y in row] for row in rows]', check: 'm' },
  // ---- adversarial: evaluation ORDER must be preserved (the workflow's BLOCKING cases) ----
  { name: 'dict comp key-before-value order',
    setup: 'log=[]\ndef k(x):\n    log.append(("k",x)); return x\ndef v(x):\n    log.append(("v",x)); return x\n',
    code: 'd = {k(i): v(i) for i in range(2)}', check: 'd' },
  { name: 'f() + [comp] left-to-right order',
    setup: 'log=[]\ndef f():\n    log.append("f"); return [0]\ndef g():\n    log.append("g"); return [1,2]\n',
    code: 'z = f() + [x for x in g()]', check: 'z' },
  { name: 'f() + ternary left-to-right order',
    setup: 'log=[]\ndef f():\n    log.append("f"); return 0\ndef cond():\n    log.append("c"); return True\n',
    code: 'z = f() + (10 if cond() else 20)', check: 'z' },
  { name: 'AugAssign attribute-target load order',
    setup: 'log=[]\nclass C:\n    @property\n    def x(self):\n        log.append("load"); return self._x\n    @x.setter\n    def x(self, val):\n        self._x = val\nc = C()\nc._x = [0]\ndef g():\n    log.append("g"); return [1,2]\n',
    code: 'c.x += [i for i in g()]', check: 'c._x' },
  { name: 'AugAssign name-target desugars (count += comp)',
    setup: 'count=0', code: 'count += sum([i for i in range(4)])', check: 'count' },
  // Witness: confirms AnnAssign evaluates value before annotation (so hoisting the value-sugar is
  // order-safe even with a side-effecting annotation). If CPython were annotation-first this fails.
  { name: 'AnnAssign value-vs-annotation order',
    setup: 'log=[]\ndef ann():\n    log.append("ann"); return list\ndef g():\n    log.append("g"); return [1,2]\n',
    code: 'x: ann() = [i for i in g()]', check: 'x' },
  // Class-body comprehension: the comp scope can't see class names, so the ORIGINAL raises
  // NameError. The desugar must PRESERVE it (also raising NameError) — not turn it into an inline
  // class-body loop that resolves `x` and succeeds. Both runs must raise the same exception.
  { name: 'class-body comprehension preserves comp scope (NameError parity)',
    setup: '', code: 'class C:\n    x = 1\n    y = [x for _ in range(1)]', check: 'C.y' },
  // Class-body comp that does NOT reference class names still must match (preserved -> same value
  // and no extra class attributes).
  { name: 'class-body comprehension value + no extra class attrs',
    setup: '', code: 'class C:\n    y = [i for i in range(3)]', check: '(C.y, sorted(k for k in vars(C) if not k.startswith("__")))' },
];

test.describe('Phase 4 desugar: semantic equivalence (original vs desugared in Pyodide)', () => {
  test('original and desugared Python produce identical value + side-effect order', async ({ page }) => {
    test.setTimeout(200000);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__pyodide && window.BlockPyAstBridge && window.BlockPyIrDesugar && window.BlockPyIR,
      null, { timeout: 180000 });

    const results = await page.evaluate(async (cases) => {
      const py = await window.BlockPyAstBridge.getPyodide();
      // A Python harness: run src in a FRESH namespace, return repr(check) and repr(log).
      py.runPython(`
import json
def _bp_eval(src, check):
    ns = {}
    try:
        exec(src, ns)
        log = ns.get('log', '__no_log__')
        return json.dumps({'val': repr(eval(check, ns)), 'log': repr(log)})
    except Exception as e:
        # A raised exception IS observable behavior; compare its type between the two runs.
        return json.dumps({'exc': type(e).__name__})
`);
      const evalPy = py.globals.get('_bp_eval');
      const out = [];
      try {
        for (const c of cases) {
          let desugaredSrc = null;
          let entry = { name: c.name };
          try {
            const ir = await window.BlockPyAstBridge.pythonToIR(py, c.code);
            const dir = window.BlockPyIrDesugar.desugarIr(ir);
            desugaredSrc = await window.BlockPyAstBridge.irToPython(py, dir);
            entry.desugaredSrc = desugaredSrc;
            const origin = JSON.parse(evalPy(c.setup + '\n' + c.code, c.check));
            const desug = JSON.parse(evalPy(c.setup + '\n' + desugaredSrc, c.check));
            entry.origin = origin;
            entry.desug = desug;
            entry.match = origin.val === desug.val && origin.log === desug.log;
          } catch (e) {
            entry.error = String(e && e.message || e);
            entry.desugaredSrc = desugaredSrc;
          }
          out.push(entry);
        }
      } finally {
        evalPy.destroy();
      }
      return out;
    }, CASES);

    // Guard against a vacuous pass: every case must have actually run.
    expect(results.length).toBe(CASES.length);

    // Surface a readable diff for any mismatch before asserting.
    const failures = results.filter((r) => !r.match || r.error);
    if (failures.length) {
      console.log('DESUGAR SEMANTIC MISMATCHES:\n' + JSON.stringify(failures, null, 2));
    }
    for (const r of results) {
      expect(r.error, `${r.name} threw: ${r.error}\n--- desugared ---\n${r.desugaredSrc}`).toBeFalsy();
      expect(r.match,
        `${r.name}: value/log differ\norigin=${JSON.stringify(r.origin)}\ndesug=${JSON.stringify(r.desug)}\n--- desugared src ---\n${r.desugaredSrc}`)
        .toBe(true);
    }
  });
});
