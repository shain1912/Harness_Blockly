// P1: Macro block model — pure-Node tests (Playwright runner, no browser/page).
//
// A "macro block" is a ONE-WAY authoring block: a single high-level block (for kids)
// that expands to MULTIPLE lines of canonical Python via a `pythonTemplate` with
// `{slotId}` holes. It never reverse-collapses; the core 1:1 parser owns round-tripping.
//
// Invariant-2 (the contract these tests guard): a macro's pythonTemplate, with sample
// slot values injected, MUST parse and round-trip losslessly through the core parser.
// A macro can therefore never emit Python the core cannot represent.
const { test, expect } = require('@playwright/test');
const A = require('../src/utils/libraryAbstraction.js');
const P = require('../src/utils/parser.js');

const norm = (s) => s.replace(/\r/g, '').replace(/\s+/g, '').trim();

// A well-formed macro: mediapipe hand tracking collapsed to one "손 인식하기" block.
const HANDS_MACRO = {
  type: 'macro_mediapipe_hands',
  name: '손 인식하기',
  slots: [
    { id: 'image', label: '이미지', type: 'value', default: 'frame' },
    { id: 'maxHands', label: '최대 손 개수', type: 'number', default: 2 },
  ],
  pythonTemplate: 'hands = mp_hands.Hands(max_num_hands={maxHands})\nresult = hands.process({image})',
  icon: '✋', colour: '#10b981', category: 'mediapipe',
};

test.describe('P1 macro block model', () => {
  test('expandMacroTemplate substitutes every {slot} with its value', () => {
    const code = A.expandMacroTemplate(HANDS_MACRO.pythonTemplate, { image: 'frame', maxHands: 2 });
    expect(code).toBe('hands = mp_hands.Hands(max_num_hands=2)\nresult = hands.process(frame)');
    expect(code).not.toContain('{'); // no unfilled holes
  });

  test('sampleValuesFor maps each slot id to a parser-safe default', () => {
    const vals = A.sampleValuesFor(HANDS_MACRO);
    expect(vals.image).toBe('frame');   // value-type → raw identifier
    expect(vals.maxHands).toBe(2);      // number-type → numeric literal
  });

  test('validateMacroTemplate ACCEPTS a template that round-trips through the core parser (Invariant-2)', () => {
    const res = A.validateMacroTemplate(HANDS_MACRO, P);
    expect(res.ok).toBe(true);
    expect(norm(res.roundtrip)).toBe(norm(res.code));
  });

  test('validateMacroTemplate REJECTS a template that is not valid core Python', () => {
    const broken = { ...HANDS_MACRO, pythonTemplate: 'hands = mp_hands.Hands(max_num_hands={maxHands' };
    const res = A.validateMacroTemplate(broken, P);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  test('every shipped MACRO_PRESET passes Invariant-2 (lossless core round-trip)', () => {
    const presets = A.MACRO_PRESETS;
    expect(Array.isArray(presets)).toBe(true);
    expect(presets.length).toBeGreaterThan(0);
    for (const spec of presets) {
      const res = A.validateMacroTemplate(spec, P);
      expect(res.ok, `${spec.type}: ${res.error || 'round-trip mismatch'}`).toBe(true);
    }
  });

  test('MACRO_PRESET specs are well-formed (unique type, slots cover every template hole)', () => {
    const seen = new Set();
    for (const spec of A.MACRO_PRESETS) {
      expect(spec.type, `duplicate type ${spec.type}`).not.toBe(undefined);
      expect(seen.has(spec.type)).toBe(false);
      seen.add(spec.type);
      const holes = [...spec.pythonTemplate.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]);
      const slotIds = new Set((spec.slots || []).map((s) => s.id));
      for (const h of holes) {
        expect(slotIds.has(h), `${spec.type}: template hole {${h}} has no matching slot`).toBe(true);
      }
    }
  });
});
