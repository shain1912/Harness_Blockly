// Coverage: async/await (ASY-01..04) — async def / await / async for / async with.
// These were previously parse errors (the `async`/`await` keywords were unknown), so the
// whole Async catalog section was 0/4. This locks in lossless Python->AST->Python round-trips
// and verifies astToBlockly never throws and never silently quotes code as a string literal.
// Pure Node (Playwright runner, no page).
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
  ['async def', 'async def fetch():\n    await get()', 'method_def'],
  ['await assign', 'async def main():\n    x = await load()\n    return x', 'await_expr'],
  ['async for', 'async for item in stream():\n    print(item)', 'for_each_custom'],
  ['async with', 'async with lock() as h:\n    read(h)', 'with_statement'],
  ['await expr', 'result = await client.get(url)', 'await_expr'],
  ['async for unpack', 'async for k, v in pairs():\n    print(k, v)', 'for_unpack'],
];

test.describe('async/await support (ASY-01..04, pure Node)', () => {
  for (const [label, code, dedicatedType] of CASES) {
    test(`${label}: round-trips losslessly`, () => {
      const { py } = analyze(code);
      expect(norm(py)).toBe(norm(code));            // lossless Python round-trip
    });
    test(`${label}: astToBlockly emits the dedicated ${dedicatedType} block (no raw lump)`, () => {
      const { types } = analyze(code);
      expect(types).toContain(dedicatedType);       // routed to a real, named block
      expect(types).not.toContain('raw_statement'); // not a gray statement lump
      expect(types).not.toContain('raw_expression');// not a gray expression lump
    });
  }
});

// [W5] async comprehensions (PEP 530): `async for` clause inside list/set/dict/gen
// comprehensions, and `await` as the element expression.
const COMP_CASES = [
  'data = [x async for x in stream()]',
  'vals = [await f(x) async for x in ait()]',
  'd = {k: v async for k, v in apairs()}',
  's = {x async for x in ait()}',
  'g = (x async for x in ait())',
];

test.describe('async comprehensions (PEP 530, pure Node)', () => {
  for (const code of COMP_CASES) {
    test(`"${code}" round-trips losslessly without a raw lump`, () => {
      const { py, types } = analyze(code);
      expect(norm(py)).toBe(norm(code));
      expect(types).not.toContain('raw_statement');
      expect(types).not.toContain('raw_expression');
    });
  }
});
