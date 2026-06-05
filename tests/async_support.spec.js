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
  ['async def', 'async def fetch():\n    await get()'],
  ['await assign', 'async def main():\n    x = await load()\n    return x'],
  ['async for', 'async for item in stream():\n    print(item)'],
  ['async with', 'async with lock() as h:\n    read(h)'],
  ['await expr', 'result = await client.get(url)'],
];

test.describe('async/await support (ASY-01..04, pure Node)', () => {
  for (const [label, code] of CASES) {
    test(`${label}: round-trips losslessly`, () => {
      const { py } = analyze(code);
      expect(norm(py)).toBe(norm(code));            // lossless Python round-trip
    });
    test(`${label}: astToBlockly emits no string-literal lump`, () => {
      const { types } = analyze(code);
      // await falls to the lossless raw_expression fallback (acceptable); the bug we guard
      // against is a `text` block that silently quotes the await expression as a string.
      expect(types).not.toContain('text');
    });
  }
});
