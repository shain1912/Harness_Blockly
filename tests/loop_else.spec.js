// Coverage: for/else (CF-08) and while/else (CF-11) — the loop-else clause that runs only
// when the loop completes without break. Previously parse errors (the trailing `else` after a
// loop body was a stray token). Now they parse, round-trip losslessly, and astToBlockly emits
// dedicated for_else / while_else blocks (no gray raw lump). Pure Node.
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
  ['for/else', 'for x in items:\n    print(x)\nelse:\n    print("done")', 'for_else'],
  ['for/else + break', 'for x in items:\n    if x == 1:\n        break\nelse:\n    found()', 'for_else'],
  ['for/else tuple', 'for k, v in pairs():\n    use(k)\nelse:\n    done()', 'for_else'],
  ['while/else', 'while cond():\n    step()\nelse:\n    finish()', 'while_else'],
  ['async for/else', 'async for x in stream():\n    handle(x)\nelse:\n    cleanup()', 'for_else'],
];

test.describe('for/else & while/else (CF-08, CF-11, pure Node)', () => {
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
