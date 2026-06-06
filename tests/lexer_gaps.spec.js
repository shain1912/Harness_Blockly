// Lexer gaps: explicit line continuation `\` (MSC-04) and semicolon-separated simple
// statements (MSC-05). Both were parse errors. Blockly has no concept of either, so they
// normalize: a continuation joins the physical lines into one logical statement; a
// semicolon splits into separate statement blocks. They must parse, produce dedicated
// blocks (no raw lump), and re-emit the canonical normalized Python. Pure Node.
const { test, expect } = require('@playwright/test');
const P = require('../src/utils/parser.js');

function analyze(code) {
  const ast = new P.Parser(new P.Tokenizer(code).tokenize()).parse();
  const py = P.astToPython(ast);
  const bj = P.astToBlockly(ast);
  const types = [];
  (function walk(o) { if (!o || typeof o !== 'object') return; if (o.type) types.push(o.type); for (const k in o) walk(o[k]); })(bj);
  return { py: py.trim(), types: [...new Set(types)] };
}

test.describe('lexer gaps (line continuation, semicolon — pure Node)', () => {
  test('line continuation joins physical lines (MSC-04)', () => {
    const { py, types } = analyze('a = 1 + \\\n    2');
    expect(py).toBe('a = 1 + 2');
    expect(types).toContain('math_arithmetic');
    expect(types).not.toContain('raw_statement');
    expect(types).not.toContain('raw_expression');
  });

  test('line continuation inside a call argument', () => {
    const { py } = analyze('total = sum(a, \\\n            b)');
    expect(py).toBe('total = sum(a, b)');
  });

  test('semicolon separates two statements (MSC-05)', () => {
    const { py, types } = analyze('a = 1; b = 2');
    expect(py).toBe('a = 1\nb = 2');
    expect(types).toContain('variables_set');
    expect(types).not.toContain('raw_statement');
  });

  test('semicolon separates three statements', () => {
    const { py } = analyze('x = 1; y = 2; z = 3');
    expect(py).toBe('x = 1\ny = 2\nz = 3');
  });

  test('trailing semicolon is harmless', () => {
    const { py } = analyze('a = 1;');
    expect(py).toBe('a = 1');
  });
});
