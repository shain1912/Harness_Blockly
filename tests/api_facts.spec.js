// [Phase 1, Work-Unit 1.2a] apiFactsToSpecs normalizes Pyodide introspection facts into
// the two registration shapes we already have: function call blocks (registerBlock — real
// arg names replace generic param_N; simple calls are sound by form) and constant dropdown
// seeds (LIB_CONST_SEEDS). Pure & deterministic — no Pyodide, no Blockly.
const { test, expect } = require('@playwright/test');
const A = require('../src/utils/libraryAbstraction.js');

const FACTS = {
  module: 'cv2',
  functions: [
    { name: 'cvtColor', params: ['src', 'code'] },
    { name: 'imread', params: ['filename', 'flags'] },
    { name: '__loader__', params: [] },   // dunder — must be skipped
    { name: '_private', params: [] },      // private — must be skipped
  ],
  classes: [
    { name: 'VideoCapture', params: ['index'] }, // constructor → treated as a function
  ],
  constants: ['COLOR_BGR2GRAY', 'IMREAD_COLOR', '__spec__'], // dunder skipped
};

test.describe('apiFactsToSpecs', () => {
  test('functions become registerBlock specs with real arg names', () => {
    const out = A.apiFactsToSpecs(FACTS);
    const cvt = out.functions.find(f => f.func === 'cvtColor');
    expect(cvt).toBeTruthy();
    expect(cvt.lib).toBe('cv2');
    expect(cvt.args).toEqual(['src', 'code']);
    expect(cvt.title).toBe('cv2.cvtColor');
    // classes are included as constructor functions
    expect(out.functions.some(f => f.func === 'VideoCapture')).toBe(true);
  });

  test('dunder and private members are skipped', () => {
    const out = A.apiFactsToSpecs(FACTS);
    expect(out.functions.some(f => /^_/.test(f.func))).toBe(false);
    expect(out.constants.some(c => /^_/.test(c))).toBe(false);
  });

  test('constants are collected for the dropdown seed', () => {
    const out = A.apiFactsToSpecs(FACTS);
    expect(out.constants).toContain('COLOR_BGR2GRAY');
    expect(out.constants).toContain('IMREAD_COLOR');
  });
});
