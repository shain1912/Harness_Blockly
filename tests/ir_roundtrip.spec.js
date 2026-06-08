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

  // ExceptHandler's field is literally named `type`, which collides with the IR node
  // discriminator key. The bridge remaps any such field to `_field_type`; verify the
  // collision is handled so try/except round-trips at the pure bridge level (python->IR->python).
  test('python->IR->python handles the ExceptHandler `type` field-name collision', async ({ page }) => {
    const cases = [
      'try:\n    pass\nexcept Exception as e:\n    pass',
      'try:\n    pass\nexcept:\n    pass',
    ];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        out.push((await B.irToPython(window.__pyodide, ir)).replace(/\n$/, ''));
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

  // Calls slice (Tier B) through REAL Blockly load->save: no-arg, positional, keyword,
  // *args/**kwargs, method calls, nesting, and a call-as-statement (print).
  test('calls survive a real Blockly load->save', async ({ page }) => {
    const cases = ["print('hi')", 'f()', 'f(1, 2)', 'f(x=1)', 'obj.m(1)', 'g(h(1))',
      'r = len(xs)', 'es = set()', 'mixed = f(1, *a, x=2, **d)'];
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

  // Control-flow slice (multi-line) through REAL Blockly load->save: if/elif/else,
  // while-else, for-else, tuple targets, pass/break/continue, and nesting.
  test('control flow survives a real Blockly load->save', async ({ page }) => {
    const cases = [
      'if x:\n    a()\nelif y:\n    b()\nelse:\n    c()',
      'while x:\n    a()\nelse:\n    b()',
      'for i in xs:\n    a()\nelse:\n    b()',
      'for a, b in items:\n    print(a)',
      'if x:\n    pass',
      'while True:\n    break',
      'for i in r:\n    continue',
      'if x:\n    if y:\n        a()',
    ];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push(await B.irToPython(window.__pyodide, back));
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    expect(codes.map((c) => c.replace(/\n$/, ''))).toEqual(cases);
  });

  // Functions slice (multi-line) through REAL Blockly load->save: signatures (posonly /,
  // kwonly *, *args/**kwargs, defaults, annotations, return type), decorators, return,
  // lambda, global/nonlocal.
  test('functions survive a real Blockly load->save', async ({ page }) => {
    const cases = [
      'def f():\n    pass',
      'def f(a, b=2):\n    return a + b',
      'def f(a, /, b, *, c):\n    pass',
      'def f(*args, **kw):\n    pass',
      "def f(a: int, b: str='x') -> bool:\n    return True",
      '@deco\ndef f():\n    pass',
      'def f(a, *b, c=3, **d):\n    pass',
      'g = lambda x, y=1: x + y',
      'def outer():\n    x = 1\n\n    def inner():\n        nonlocal x\n        x = 2',
      'def f():\n    global G\n    G = 1',
      'def f[T](x: T):\n    pass',
      'def f[T: int]():\n    pass',
      'def f[*Ts]():\n    pass',
      'def f[**P]():\n    pass',
    ];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push((await B.irToPython(window.__pyodide, back)).replace(/\n$/, ''));
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // Classes slice (multi-line) through REAL Blockly load->save: bare class, single/multiple
  // bases, metaclass + ** keywords, decorators, PEP-695 type params (with bound), and a
  // body with members (attribute + method).
  test('classes survive a real Blockly load->save', async ({ page }) => {
    const cases = [
      'class C:\n    pass',
      'class C(Base):\n    pass',
      'class A(B, C):\n    pass',
      'class C(Base, metaclass=Meta):\n    pass',
      '@deco\nclass C:\n    pass',
      'class C(B, **kw):\n    pass',
      'class C[T]:\n    pass',
      'class C[T: int](Base):\n    pass',
      'class C:\n    x = 1\n\n    def m(self):\n        return self.x',
    ];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push((await B.irToPython(window.__pyodide, back)).replace(/\n$/, ''));
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // Imports slice through REAL Blockly load->save: plain/dotted/aliased imports, multi-name
  // imports, from-imports with aliases, star import, and relative (level) imports with and
  // without a module. alias is a HELPER node (encoded in the NAMES field, no own block).
  test('imports survive a real Blockly load->save', async ({ page }) => {
    const cases = [
      'import os',
      'import os, sys',
      'import os.path',
      'import numpy as np',
      'import os.path as p',
      'from os import path',
      'from os import path, sep',
      'from os import path as p',
      'from os import name as n, sep as s',
      'from . import x',
      'from .mod import y',
      'from ..pkg import z',
      'from .. import x',
      'from os import *',
    ];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push((await B.irToPython(window.__pyodide, back)).replace(/\n$/, ''));
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // Exceptions/with slice (multi-line) through REAL Blockly load->save: del (multi-target),
  // raise (bare / exc / exc-from-cause), assert (with and without msg), with (single/multi
  // items, with and without `as`), try/except (bare, typed, named, multiple handlers),
  // else/finally, finally-only, and except* (TryStar). ExceptHandler/withitem are HELPERs.
  test('exceptions and with survive a real Blockly load->save', async ({ page }) => {
    const cases = [
      'del x',
      'del x, y',
      'del obj.attr',
      'raise',
      'raise ValueError',
      "raise ValueError('bad')",
      'raise Err from cause',
      'assert x',
      "assert x, 'msg'",
      'with open(f) as fh:\n    pass',
      'with a, b:\n    pass',
      'with open(f) as fh, lock:\n    pass',
      'with a as x, b as y:\n    pass',
      'try:\n    pass\nexcept:\n    pass',
      'try:\n    pass\nexcept Exception:\n    pass',
      'try:\n    pass\nexcept Exception as e:\n    pass',
      'try:\n    pass\nexcept ValueError:\n    pass\nexcept KeyError as e:\n    pass',
      'try:\n    pass\nexcept Exception:\n    pass\nelse:\n    pass\nfinally:\n    pass',
      'try:\n    pass\nfinally:\n    pass',
      'try:\n    pass\nexcept* ValueError:\n    pass',
      'try:\n    pass\nexcept* ValueError as e:\n    pass',
    ];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push((await B.irToPython(window.__pyodide, back)).replace(/\n$/, ''));
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // SUGAR slice through REAL Blockly load->save: ternary (IfExp) and the four comprehension
  // forms (list/set/dict/generator), incl. multiple `for` generators, multiple `if` filters,
  // tuple targets, and a parenthesized nested ternary. comprehension is a HELPER.
  test('ternary and comprehensions survive a real Blockly load->save', async ({ page }) => {
    const cases = [
      'r = a if c else b',
      'r = (a if c else b) + 1',
      'xs = [x for x in items]',
      'xs = [x for x in items if x > 0]',
      'xs = [x for x in items if x > 0 if x < 10]',
      'm = [x + y for x in a for y in b]',
      's = {x for x in items}',
      'g = (x for x in items)',
      'd = {k: v for k, v in pairs}',
      'd = {k: v for k, v in pairs if k}',
      'n = [x for row in matrix for x in row if x]',
    ];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push((await B.irToPython(window.__pyodide, back)).replace(/\n$/, ''));
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // Async slice through REAL Blockly load->save: async def (with await body, decorator, return
  // type), async for, async with (single/multi item), await/yield/yield-from expressions, and
  // the walrus operator (NamedExpr) in if-test, comprehension filter, and call-arg positions.
  test('async, yield and walrus survive a real Blockly load->save', async ({ page }) => {
    const cases = [
      'async def f():\n    pass',
      'async def f(x):\n    await x',
      '@deco\nasync def f() -> int:\n    return 1',
      'async def f():\n    async for x in it:\n        pass',
      'async def f():\n    async with cm as c:\n        pass',
      'async def f():\n    async with a, b:\n        pass',
      'r = await x',
      'def g():\n    yield',
      'def g():\n    yield 1',
      'def g():\n    yield from xs',
      'def g():\n    x = (yield)',
      'if (n := len(a)) > 10:\n    pass',
      'y = [v for v in data if (t := v) > 0]',
      'print((n := 5))',
    ];
    const codes = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push((await B.irToPython(window.__pyodide, back)).replace(/\n$/, ''));
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    expect(codes).toEqual(cases);
  });

  // f-string slice through REAL Blockly load->save. f-string unparse formatting differs across
  // CPython versions, so this asserts the round-trip PROPERTY (unparse(ir) === unparse(back))
  // rather than input==output: plain, single/multiple interpolations, conversions (!r/!s/!a),
  // format specs (static + nested {w}), the `=` debug form, and an empty f-string.
  // FormattedValue is a HELPER (only inside JoinedStr.values / a nested format_spec).
  test('f-strings survive a real Blockly load->save (round-trip property)', async ({ page }) => {
    const cases = [
      'a = f"plain"',
      'a = f""',
      'a = f"hi {name}"',
      'a = f"{x}{y}"',
      'a = f"{x!r}"',
      'a = f"{x!s} and {y!a}"',
      'a = f"{x:.2f}"',
      'a = f"{x:{w}}"',
      'a = f"{x!s:>{w}.{p}f}"',
      'a = f"{x = }"',
      'a = f"pre {obj.attr[0]} post"',
    ];
    const pairs = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push({ a: await B.irToPython(window.__pyodide, ir),
            b: await B.irToPython(window.__pyodide, back) });
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    for (const { a, b } of pairs) expect(b).toBe(a);
  });

  // match slice through REAL Blockly load->save. All 8 pattern nodes + match_case are HELPERs
  // encoded in the ir_match block's extraState (with embedded exprs as C<i>E<k> inputs), so this
  // asserts the round-trip PROPERTY (unparse(ir) === unparse(back)) over every pattern form:
  // value/singleton/sequence/star/mapping/class/as/or, capture, wildcard, guard, multi-case.
  test('match statements survive a real Blockly load->save (round-trip property)', async ({ page }) => {
    const cases = [
      'match p:\n    case 1:\n        pass',
      'match p:\n    case None:\n        pass',
      'match p:\n    case x.y:\n        pass',
      'match p:\n    case [a, b]:\n        pass',
      'match p:\n    case [a, *rest]:\n        pass',
      'match p:\n    case {"k": v, **rest}:\n        pass',
      'match p:\n    case Point(x, y=0):\n        pass',
      'match p:\n    case 1 | 2 | 3:\n        pass',
      'match p:\n    case [1] as y:\n        pass',
      'match p:\n    case x:\n        pass',
      'match p:\n    case _:\n        pass',
      'match p:\n    case 1 if x > 0:\n        pass',
      'match p:\n    case 1:\n        result = 1\n    case _:\n        result = 0',
    ];
    const pairs = await page.evaluate(async (srcs) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR, Bk = window.Blockly;
      const out = [];
      for (const s of srcs) {
        const ir = await B.pythonToIR(window.__pyodide, s + '\n');
        const ws = new Bk.Workspace();
        try {
          Bk.serialization.workspaces.load(IRm.irToBlockly(ir), ws);
          const back = IRm.blocklyToIr(Bk.serialization.workspaces.save(ws));
          out.push({ a: await B.irToPython(window.__pyodide, ir),
            b: await B.irToPython(window.__pyodide, back) });
        } finally { ws.dispose(); }
      }
      return out;
    }, cases);
    for (const { a, b } of pairs) expect(b).toBe(a);
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
