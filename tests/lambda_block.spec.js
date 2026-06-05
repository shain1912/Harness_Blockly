// Coverage: lambda expressions (ubiquitous in library code — df.apply, map, filter,
// sorted(key=...)) should convert to a dedicated `lambda_func` block, not a gray raw_*
// lump, and round-trip losslessly. Pure Node.
const { test, expect } = require('@playwright/test');
const P = require('../src/utils/parser.js');

const norm = (s) => s.replace(/#.*$/gm, '').replace(/\s+/g, '').trim();
function analyze(code) {
  const ast = new P.Parser(new P.Tokenizer(code).tokenize()).parse();
  const py = P.astToPython(ast);
  const types = [];
  (function walk(o) { if (!o || typeof o !== 'object') return; if (o.type) types.push(o.type); for (const k in o) walk(o[k]); })(P.astToBlockly(ast));
  return { py, types: [...new Set(types)] };
}

const CASES = [
  'f = lambda x: x + 1',
  'res = df.apply(lambda x: x * 2)',
  'ys = list(map(lambda v: v + 1, xs))',
  'g = lambda: 0',
];

test.describe('lambda → dedicated lambda_func block', () => {
  for (const code of CASES) {
    test(`"${code}" → lambda_func, not raw`, () => {
      const { py, types } = analyze(code);
      expect(norm(py)).toBe(norm(code));
      expect(types).toContain('lambda_func');
      expect(types).not.toContain('raw_statement');
      expect(types).not.toContain('raw_expression');
    });
  }
});

test('lambda with default param parses & round-trips', () => {
  const code = 'cb = lambda event=None: event';
  const { py } = analyze(code);
  expect(norm(py)).toBe(norm(code));
});
