const { test, expect } = require('@playwright/test');

// Browser/Pyodide tests for the CPython-3.12 ast <-> JSON IR bridge.
// Pyodide is pre-warmed on app load; window.__pyodide is exposed by pyodideRunner.

test.describe('AST-IR bridge round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__pyodide && !!window.BlockPyAstBridge && !!window.BlockPyIR,
      null, { timeout: 180000 });
  });

  test('python->IR->python is identity for simple assign', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const B = window.BlockPyAstBridge;
      const ir = await B.pythonToIR(window.__pyodide, 'x = 1\n');
      return { type: ir.type, code: await B.irToPython(window.__pyodide, ir) };
    });
    expect(out.type).toBe('Module');
    expect(out.code.trim()).toBe('x = 1');
  });

  // Regression (Codex review, Task 1.1): non-JSON Constant values must not crash
  // Python->IR (raw=0 for Constant). bytes / complex / Ellipsis are valid 3.12 consts.
  test('python->IR->python handles non-JSON constants (bytes, complex, ellipsis)', async ({ page }) => {
    const cases = ["b = b'hi'", 'c = 1j', 'e = ...'];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        out.push((await B.irToPython(window.__pyodide, ir)).trim());
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // Regression (Codex review round 2, Task 1.1): big ints must not lose precision
  // through JS JSON.parse, and non-finite complex components must not break JSON.
  test('python->IR->python preserves big ints and non-finite complex', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const B = window.BlockPyAstBridge;
      const rt = async (s) => (await B.irToPython(window.__pyodide,
        await B.pythonToIR(window.__pyodide, s + '\n'))).trim();
      const bigInt = await rt('n = 9007199254740993');
      // complex-with-inf: assert it round-trips without throwing and is a fixpoint
      const c1 = await rt('z = 1e309j');
      const c2 = await rt(c1);
      return { bigInt, c1, c2 };
    });
    expect(r.bigInt).toBe('n = 9007199254740993'); // exact — no rounding to ...992
    expect(r.c2).toBe(r.c1);                        // stable fixpoint, no JSON crash
  });

  // Task 1.3 — full single-IR pipeline through the Blockly mapping layer:
  // python -> ast IR -> blocks -> IR -> python.
  test('full pipeline: assignments -> blocks -> python', async ({ page }) => {
    const cases = ['x = 1', 'a = b = 1'];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const back = IRm.blocklyToIr(IRm.irToBlockly(ir));
        out.push((await B.irToPython(window.__pyodide, back)).trim());
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // Property harness: every snippet in the corpus must survive python -> blocks -> python
  // with its *meaning* preserved (compare canonical unparse of original vs round-tripped).
  // The corpus grows as each node-family slice lands.
  test('round-trip corpus preserves meaning (python -> blocks -> python)', async ({ page }) => {
    const fs = require('fs');
    const cases = fs.readFileSync('tests/fixtures/roundtrip_corpus.txt', 'utf8')
      .split('\n').map((s) => s.trim()).filter(Boolean);
    const results = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const back = IRm.blocklyToIr(IRm.irToBlockly(ir));
        out.push({
          a: (await B.irToPython(window.__pyodide, ir)).trim(),     // canonical original
          b: (await B.irToPython(window.__pyodide, back)).trim(),   // via blocks
        });
      }
      return out;
    }, cases);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].b, `corpus line: ${cases[i]}`).toBe(results[i].a);
    }
  });

  // Push-back evidence (Codex Collections round 2): Set([]) is unreachable from valid
  // Python — there is no empty-set literal. So failing loud on it does not break raw=0,
  // which is defined over valid Python source. Every real set (>=1 elt) round-trips.
  test('Python has no empty-set literal: {} is Dict and set() is Call (Set([]) unreachable)', async ({ page }) => {
    const t = await page.evaluate(async () => {
      const B = window.BlockPyAstBridge;
      const a = await B.pythonToIR(window.__pyodide, 'x = {}\n');
      const b = await B.pythonToIR(window.__pyodide, 'x = set()\n');
      return { empty: a.body[0].value.type, setcall: b.body[0].value.type };
    });
    expect(t.empty).toBe('Dict');    // {} is always a dict literal, never an empty Set
    expect(t.setcall).toBe('Call');  // set() is a call, never a Set node
  });

  // Collections slice: every form survives a REAL Blockly load->save (mutator arity),
  // including empty collections, nesting, and dict ** unpacking (null key).
  test('collections survive a real Blockly load->save', async ({ page }) => {
    const cases = ['xs = [1, 2, 3]', 'empty = []', 't = (1, 2)', 's = {1, 2, 3}',
      "d = {'a': 1}", 'ed = {}', 'nested = [[1], [2]]', "merged = {**d, 'c': 3}"];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push((await B.irToPython(window.__pyodide, back)).trim());
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // Assignment-forms slice through REAL Blockly load->save: augmented, annotated (with and
  // WITHOUT value — the optional VALUE input), and tuple-unpack.
  test('assignment forms survive a real Blockly load->save', async ({ page }) => {
    const cases = ['x += 1', 'flags |= 4', 'av: int = 1', 'nv: str', 'a, b = pair'];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push((await B.irToPython(window.__pyodide, back)).trim());
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // Access/unpacking slice through REAL Blockly load->save: attribute chains, subscript
  // with index and with each slice form (optional lower/upper/step), starred elements,
  // and previously-deferred targets (Attribute/Subscript) now reachable.
  test('attribute/subscript/slice/starred survive a real Blockly load->save', async ({ page }) => {
    const cases = ['attr = obj.x', 'chain = o.a.b.c', 'item = m[0]', 'sl = a[1:5]',
      'sl2 = a[1:]', 'sl3 = a[:5]', 'sl4 = a[::2]', 'sl5 = a[:]', 'star = [*a, b]',
      'o.x = 5', 'xs[0] += 1'];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push((await B.irToPython(window.__pyodide, back)).trim());
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // Codex review (round 2): exercise the REAL Blockly serialization path — load the
  // generated JSON into an actual workspace, save it back, then to IR/Python. This
  // catches mutator-input mismatches that the pure-JSON round-trip cannot.
  test('chained assignment survives a real Blockly load->save', async ({ page }) => {
    const code = await page.evaluate(async () => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const ir = await B.pythonToIR(window.__pyodide, 'a = b = 1\n');
      const ws = new Bk.Workspace();
      try {
        Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
        const saved = Bk.serialization.workspaces.save(ws);   // real round-trip through Blockly
        const back = IRm.blocklyToIr(saved);
        return await B.irToPython(window.__pyodide, back);
      } finally {
        ws.dispose();
      }
    });
    expect(code.trim()).toBe('a = b = 1');
  });
});
