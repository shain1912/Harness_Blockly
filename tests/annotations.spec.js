// Coverage: type annotations (W7) — annotated assignment (ASG-06), return annotation
// (FN-08 return half), and typing names (STD-18). Previously parse errors (`:` after a
// target, and `->` after the param list). Now they parse, round-trip losslessly, and
// astToBlockly emits dedicated ann_assign / method_def(RETURNS) blocks (no gray raw lump).
// Pure Node.
const { test, expect } = require('@playwright/test');
const P = require('../src/utils/parser.js');

const norm = (s) => s.replace(/#.*$/gm, '').replace(/\s+/g, '').trim();

function analyze(code) {
  const ast = new P.Parser(new P.Tokenizer(code).tokenize()).parse();
  const py = P.astToPython(ast);
  const bj = P.astToBlockly(ast);
  const types = [];
  (function walk(o) { if (!o || typeof o !== 'object') return; if (o.type) types.push(o.type); for (const k in o) walk(o[k]); })(bj);
  return { py, types: [...new Set(types)] };
}

// [label, code, dedicated block type expected in astToBlockly]
const CASES = [
  ['ann-assign with value', 'x: int = 5', 'ann_assign'],
  ['ann-assign no value', 'x: int', 'ann_assign'],
  ['ann-assign generic', 'names: list[str] = []', 'ann_assign'],
  ['ann-assign typing', 'from typing import List\nx: List[int] = []', 'ann_assign'],
  ['ann-assign attribute target', 'self.data: list = []', 'ann_assign'],
  ['ann-assign attribute no value', 'self.count: int', 'ann_assign'],
  ['return annotation', 'def f(a: int) -> str:\n    return a', 'method_def'],
  ['return annotation None', 'def g(a: int = 3, *args, **kw) -> None:\n    return None', 'method_def'],
  ['return annotation generic', 'def h() -> list[int]:\n    return []', 'method_def'],
];

// typing names ride along inside annotation expressions — round-trip only (no dedicated block).
const TYPING_CASES = [
  ['Optional', 'x: Optional[int] = None'],
  ['Dict', 'd: Dict[str, int] = {}'],
  ['Union', 'v: Union[int, str] = 0'],
];

test.describe('type annotations (ASG-06, FN-08, STD-18, pure Node)', () => {
  for (const [label, code, dedicatedType] of CASES) {
    test(`${label}: round-trips losslessly`, () => {
      expect(norm(analyze(code).py)).toBe(norm(code));
    });
    test(`${label}: astToBlockly emits dedicated ${dedicatedType} (no raw lump)`, () => {
      const { types } = analyze(code);
      expect(types).toContain(dedicatedType);
      expect(types).not.toContain('raw_statement');
      expect(types).not.toContain('raw_expression');
    });
  }
  for (const [label, code] of TYPING_CASES) {
    test(`typing ${label}: round-trips losslessly`, () => {
      expect(norm(analyze(code).py)).toBe(norm(code));
    });
  }
});
