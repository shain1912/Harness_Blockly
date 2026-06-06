// Next-iteration gaps (post-W7): Ellipsis `...` (LIT-12), subscript-target annotated
// assignment `a[i]: int = v` (ASG-06 completion), and range() in expression position
// (BIF-04 — was a gray raw_expression fallback). All should now parse, round-trip
// losslessly, and emit dedicated blocks (no raw lump). Pure Node.
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

// [label, code, dedicated block type that must appear]
const CASES = [
  // Ellipsis
  ['ellipsis assign', 'x = ...', 'ellipsis_literal'],
  ['ellipsis variadic tuple annotation', 'from typing import Tuple\ndef f() -> Tuple[int, ...]:\n    return ()', 'method_def'],
  ['ellipsis annotated value', 't: tuple = ...', 'ann_assign'],
  // Subscript-target annotated assignment
  ['subscript-target ann-assign', 'a[i]: int = 5', 'ann_assign'],
  ['nested subscript-target ann-assign', 'grid[0]: float = 0.0', 'ann_assign'],
  // range() in expression position
  ['range stop', 'r = range(5)', 'range_value'],
  ['range start-stop', 'r = range(2, 10)', 'range_value'],
  ['range start-stop-step', 'r = range(0, 10, 2)', 'range_value'],
  ['range in comprehension', 'squares = [n * n for n in range(limit)]', 'range_value'],
];

test.describe('next-iteration gaps (Ellipsis, subscript-target ann, range expr — pure Node)', () => {
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
});
