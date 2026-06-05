// P4: 1:1 validity harness — the consolidated CI gate for the macro/abstraction layer.
//
// Three layers (roadmap §4) keep the core "Python <-> block 1:1 lossless" contract from
// regressing as the abstraction layer grows:
//
//   Layer 1  Core invariant regression (Invariant-1) — the authoritative lossless gate.
//            Owned by the existing pure-Node corpora, which this harness re-runs as a
//            single command via `npm run test:validity`:
//              tests/random_roundtrip.spec.js, tests/realistic_roundtrip.spec.js,
//              tests/method_def.spec.js
//   Layer 2  Macro template check (Invariant-2) — every shipped macro's pythonTemplate,
//            with sample slot values, parses & round-trips losslessly through the core.
//   Layer 3  Macro idempotence — macro-emitted Python is a CORE FIXPOINT: running it
//            through the core parser again yields the same Python (so re-blockifying a
//            macro's output never drifts).
//
// This file owns Layers 2–3 (Layer 1 lives in the corpora it re-runs). All pure Node.
const { test, expect } = require('@playwright/test');
const A = require('../src/utils/libraryAbstraction.js');
const P = require('../src/utils/parser.js');

const norm = (s) => s.replace(/\r/g, '').replace(/\s+/g, '').trim();
const coreRoundTrip = (code) => {
  const ast = new P.Parser(new P.Tokenizer(code).tokenize()).parse();
  return P.astToPython(ast);
};

test.describe('validity harness — Layer 2: macro template lossless (Invariant-2)', () => {
  for (const spec of A.MACRO_PRESETS) {
    test(`${spec.type} template round-trips through the core parser`, () => {
      const res = A.validateMacroTemplate(spec, P);
      expect(res.ok, res.error || `round-trip mismatch:\n${res.code}\n--\n${res.roundtrip}`).toBe(true);
    });
  }
});

test.describe('validity harness — Layer 3: macro-emitted Python is a core fixpoint', () => {
  for (const spec of A.MACRO_PRESETS) {
    test(`${spec.type} is idempotent under core round-trip`, () => {
      const p0 = A.expandMacroTemplate(spec.pythonTemplate, A.sampleValuesFor(spec));
      const p1 = coreRoundTrip(p0);
      const p2 = coreRoundTrip(p1);
      // Invariant-2: first pass is already lossless.
      expect(norm(p1)).toBe(norm(p0));
      // Idempotence: a second pass changes nothing — stable under re-blockification.
      expect(norm(p2)).toBe(norm(p1));
    });
  }
});
