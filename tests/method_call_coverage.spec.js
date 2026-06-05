// Coverage: receiver.method(args) calls (math.sqrt(4), s.upper(), obj.method(1,2))
// should convert to the dedicated `method_call` block — not a gray raw_* fallback —
// and round-trip losslessly. Pure Node (Playwright runner, no page).
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

const CASES = [
  'y = math.sqrt(4)',
  'name = s.upper()',
  'obj.method(1, 2)',
  'data = config.get("key", 0)',
];

test.describe('method_call coverage for dotted calls (no engine / Node)', () => {
  for (const code of CASES) {
    test(`"${code}" → method_call block, not raw`, () => {
      const { py, types } = analyze(code);
      expect(norm(py)).toBe(norm(code));                 // lossless round-trip
      expect(types).toContain('method_call');            // dedicated block used
      expect(types).not.toContain('raw_statement');
      expect(types).not.toContain('raw_expression');
    });
  }
});
