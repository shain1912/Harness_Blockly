// [Feature B Phase 1] Library constants/attributes (cv2.COLOR_BGR2GRAY, cv2.data.haarcascades)
// were text-field attribute_access blocks. A non-called attribute rooted at an imported
// module now becomes a dedicated lib_const dropdown block, while ordinary object attributes
// (self.x, obj.attr) keep attribute_access. Pure Node (round-trip + block identity).
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

test.describe('Feature B Phase 1: library constants -> lib_const (pure Node)', () => {
  const CONST_CASES = [
    ['cv2 color constant', 'import cv2\nc = cv2.COLOR_BGR2GRAY'],
    ['cv2 nested attribute', 'import cv2\np = cv2.data.haarcascades'],
    ['cv2 constant as call arg', 'import cv2\ng = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)'],
    ['non-cv2 import constant', 'import os\nx = os.SEEK_END'],
  ];
  for (const [label, code] of CONST_CASES) {
    test(`${label}: round-trips & uses lib_const`, () => {
      const { py, types } = analyze(code);
      expect(norm(py)).toBe(norm(code));
      expect(types).toContain('lib_const');
    });
  }

  test('ordinary object attributes still use attribute_access (not lib_const)', () => {
    // `self` and `obj` are not imported modules, so these stay attribute_access.
    const { py, types } = analyze('self.value = obj.field');
    expect(norm(py)).toBe(norm('self.value = obj.field'));
    expect(types).toContain('attribute_access');
    expect(types).not.toContain('lib_const');
  });
});
