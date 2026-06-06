// Feature A: optional type hints via +/- toggles. Assignments and defs no longer force an
// annotation — a unified `var_assign` block carries an optional `: type` (toggled), and
// `method_def` carries an optional `-> type`. This spec pins the block identity + round-trip:
// simple/annotated assignments all become `var_assign` (the W7 `ann_assign` is retired, and
// the built-in `variables_set` is no longer used for Name targets). Pure Node.
const { test, expect } = require('@playwright/test');
const P = require('../src/utils/parser.js');

const norm = (s) => s.replace(/#.*$/gm, '').replace(/\s+/g, '').trim();

function analyze(code) {
  const ast = new P.Parser(new P.Tokenizer(code).tokenize()).parse();
  const py = P.astToPython(ast);
  const bj = P.astToBlockly(ast);
  const types = [];
  (function walk(o) { if (!o || typeof o !== 'object') return; if (o.type) types.push(o.type); for (const k in o) walk(o[k]); })(bj);
  // first var_assign block's extraState (if any) — to assert the type toggle state
  let hasType = null;
  (function find(o) { if (!o || typeof o !== 'object' || hasType !== null) return; if (o.type === 'var_assign') { hasType = !!(o.extraState && o.extraState.hasType); return; } for (const k in o) find(o[k]); })(bj);
  return { py, types: [...new Set(types)], hasType };
}

const CASES = [
  // [label, code, expectHasType]
  ['plain assignment', 'x = 5', false],
  ['annotated assignment', 'x: int = 5', true],
  ['annotation no value', 'x: int', true],
  ['attribute-target annotation', 'self.data: list = []', true],
  ['subscript-target annotation', 'a[i]: int = 5', true],
];

test.describe('Feature A: optional type hints (pure Node)', () => {
  for (const [label, code, expectHasType] of CASES) {
    test(`${label}: round-trips & uses var_assign`, () => {
      const { py, types, hasType } = analyze(code);
      expect(norm(py)).toBe(norm(code));
      expect(types).toContain('var_assign');
      expect(types).not.toContain('variables_set'); // Name assignments no longer use the built-in
      expect(types).not.toContain('ann_assign');    // retired
      expect(hasType).toBe(expectHasType);
    });
  }

  test('def without return annotation has no -> type', () => {
    const { py, types } = analyze('def f(a):\n    return a');
    expect(norm(py)).toBe(norm('def f(a):\n    return a'));
    // method_def (or procedures_def*) must not emit a stray return annotation
    expect(py).not.toContain('->');
  });

  test('def with return annotation round-trips via method_def', () => {
    const { py, types } = analyze('def f(a: int) -> str:\n    return a');
    expect(norm(py)).toBe(norm('def f(a: int) -> str:\n    return a'));
    expect(types).toContain('method_def');
  });
});
