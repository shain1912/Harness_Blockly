# BlockPy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn BlockPy's lossless Python↔block bridge into a research-grade, deployable, teachable platform where any Python library — and LLM-generated code — becomes editable blocks, with the parser acting as a correctness oracle.

**Architecture:** One system, three lenses (product / research / education). A provably-lossless bidirectional text↔block transformation (the *spine*) underpins three *pillars*: (B) automatic library→block synthesis gated by the parser oracle, (①) self-hosting block-authored libraries, (②) verified LLM "vibe coding" into blocks. The teaching deployment doubles as the research user-study; product features double as research artifacts.

**Tech Stack:** React 19 + Vite, Blockly (CDN), hand-written Python compiler (`src/utils/parser.js`), `LibraryAbstractionEngine` (`src/utils/libraryAbstraction.js`), Pyodide (real-Python runtime), Express backend proxying an LLM, Playwright tests.

---

## 1. Vision & Alignment

| System part | Product | Research | Education |
|---|---|---|---|
| Lossless parser (oracle) | trustworthy convert | **Thesis A**: formal bidirectional-transformation, proven round-trip laws + characterized representable fragment | reliable foundation students trust |
| `lib`+prompt → blocks | "use any library" | **Thesis B**: oracle-gated neuro-symbolic synthesis (soundness by construction) | teach with real libs (cv2/pandas) |
| Block-authored modules | reusable visual components | **Pillar ①**: self-hosting/reflective block language | teachers ship custom blocks |
| LLM agent → blocks | vibe coding | **Pillar ②**: verified LLM block generation | NL→blocks for novices |

**Honest invariant boundary (must hold in all claims):** the oracle guarantees **representation fidelity** (text↔block lossless), NOT **program correctness**. Program correctness needs the *execution* loop (Pyodide run → observe). Claims are split across these two layers.

## 2. Roadmap (each phase ships product + produces a research/teaching asset)

- **Phase 0 — Core + instrumentation + first teaching use.** Harden parser coverage (≈94.5% today). Add telemetry (every convert / round-trip outcome / block usage / error) — this is *both* product analytics and research data. Deploy the working app to a real class as the eventual control cohort. *(Mostly DONE except telemetry + deployment.)*
- **Phase 1 — Oracle-gated library block synthesis.** This plan's detailed work. Pipeline: introspect → AI-propose → **parser-verify** → register → repair/drop. Product feature + Thesis-B mechanism + lets students use real libs.
- **Phase 2 — Formalize + evaluate.** Formal bx/lens characterization of the representable fragment (Thesis A). Corpus eval over 50–100 PyPI libs with **ablations** (oracle-gate on/off, introspection-grounding on/off) and **baselines** (LLM-only, preset-only). Publish a library→blocks benchmark dataset.
- **Phase 3 — Classroom controlled study.** Feature-flagged A/B in a real course; measure learning/transfer (Thesis C). Education venue == user study == product validation.
- **Pillar ① / ②** layer onto the spine once Phase 1 lands: export block-authored modules and feed them back through the same introspection pipeline (①); wire the LLM agent loop NL→python→blocks→edit→python→run (②).

**Sequencing rule:** ship product early & continuously; layer research rigor on the *deployed* system; let the classroom generate study data. Do NOT perfect all pillars at once.

---

## 3. Phase 1 — Oracle-gated library block synthesis

**What already exists (do not rebuild):**
- `validateMacroTemplate(spec, parser)` → `{ok, code, roundtrip, error}` — expands a spec's `pythonTemplate` with sample slot values and confirms it parses + round-trips. **This is the oracle gate.**
- `registerMacroBlock(spec, parser)` → validates then registers a Blockly block + generator. Needs `Blockly` (browser).
- Spec shape: `{ type, name, slots:[{id,label,type:'value'|'number'|'string',default}], pythonTemplate, icon, colour, category }`.
- `AI_PRESETS`, `registerBlock` (dynamic `lib_<lib>_<func>` call blocks), `lib_const` (constant dropdowns).

**Phase 1 work-units:**
- **1.1 (this plan, detailed): synthesis core + repair + graceful drop.** A pure, Node-testable `planSynthesis` (oracle-gate + one repair attempt + categorize) and a thin browser-side `synthesizeBlocks` that registers the survivors. Embeds the Thesis-B contribution and is deterministically testable without AI/Pyodide.
- **1.2 (future sub-plan): Pyodide introspection probe** — a Python snippet returning `{functions:[{name,params,defaults}], constants:[], classes:[]}` for an imported module; map to draft specs (real arg labels, real constant lists). Detailed plan written when 1.1 lands.
- **1.3 (future sub-plan): AI spec generation from purpose prompt** — backend endpoint takes (introspected API + user intent) → returns candidate specs (a *subset* + friendly labels); every candidate flows through 1.1's gate. Detailed plan when 1.2 lands.
- **1.4 (future sub-plan): corpus evaluation harness** — run 1.1–1.3 over a PyPI list; record soundness/coverage/quality + ablations. Belongs to Phase 2.

> Work-units 1.2–1.4 are intentionally NOT broken into bite-sized tasks here — they need their own specs (introspection is async/Pyodide; AI needs the backend). Plan them when reached. Only 1.1 is task-ready.

### Files (Work-Unit 1.1)
- Modify: `src/utils/libraryAbstraction.js` — add `planSynthesis(specs, parser, repair)` (pure) and `LibraryAbstractionEngine.prototype.synthesizeBlocks(specs, repair)` (registers survivors); export `planSynthesis`.
- Test: `tests/synthesize_blocks.spec.js` (pure Node — exercises `planSynthesis` via the real parser, no Blockly).

---

### Task 1: `planSynthesis` — oracle gate categorizes specs

**Files:**
- Modify: `src/utils/libraryAbstraction.js` (add `planSynthesis` near `validateMacroTemplate`, and to `module.exports`)
- Test: `tests/synthesize_blocks.spec.js`

- [ ] **Step 1: Write the failing test**

```javascript
const { test, expect } = require('@playwright/test');
const A = require('../src/utils/libraryAbstraction.js');
const P = require('../src/utils/parser.js');

const VALID = {
  type: 'macro_demo_ok', name: 'OK', slots: [{ id: 'n', label: 'N', type: 'number', default: 1 }],
  pythonTemplate: 'x = {n} + 1',
};
// pythonTemplate the core parser cannot represent losslessly (match/case is an ❌ gap),
// standing in for an LLM hallucination that must be rejected.
const BAD = {
  type: 'macro_demo_bad', name: 'Bad', slots: [{ id: 'v', label: 'V', type: 'value', default: 'x' }],
  pythonTemplate: 'match {v}:\n    case 1:\n        pass',
};

test.describe('planSynthesis — oracle-gated categorization', () => {
  test('valid spec is accepted, invalid spec is rejected', () => {
    const plan = A.planSynthesis([VALID, BAD], P);
    expect(plan.toRegister.map(s => s.type)).toEqual(['macro_demo_ok']);
    expect(plan.rejected.map(r => r.type)).toEqual(['macro_demo_bad']);
    expect(plan.repaired).toEqual([]);
    expect(plan.rejected[0].error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/synthesize_blocks.spec.js -g "valid spec is accepted"`
Expected: FAIL — `A.planSynthesis is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/utils/libraryAbstraction.js` (after `validateMacroTemplate`):

```javascript
// [Phase 1] Oracle-gated synthesis planner (pure — no Blockly). For each candidate spec,
// gate it through the lossless round-trip oracle. Specs that pass are queued for
// registration; specs that fail get ONE optional repair attempt; still-failing specs are
// dropped (graceful degradation — partial success beats total failure). Returns
// { toRegister: spec[], repaired: spec[], rejected: {type,error}[] }.
function planSynthesis(specs, parser, repair) {
  const toRegister = [];
  const repaired = [];
  const rejected = [];
  for (const spec of specs || []) {
    let v = validateMacroTemplate(spec, parser);
    if (v.ok) { toRegister.push(spec); continue; }
    if (typeof repair === 'function') {
      const fixed = repair(spec, v.error || 'round-trip mismatch');
      if (fixed) {
        const v2 = validateMacroTemplate(fixed, parser);
        if (v2.ok) { repaired.push(fixed); toRegister.push(fixed); continue; }
        v = v2;
      }
    }
    rejected.push({ type: spec.type, error: v.error || 'round-trip mismatch' });
  }
  return { toRegister, repaired, rejected };
}
```

Add `planSynthesis` to the file's `module.exports` (alongside `expandMacroTemplate`, `validateMacroTemplate`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/synthesize_blocks.spec.js -g "valid spec is accepted"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/libraryAbstraction.js tests/synthesize_blocks.spec.js
git commit -m "feat(synthesis): planSynthesis oracle-gate categorizes candidate block specs"
```

---

### Task 2: `planSynthesis` — repair loop recovers a fixable spec

**Files:**
- Test: `tests/synthesize_blocks.spec.js` (add a test)

- [ ] **Step 1: Write the failing test**

```javascript
test('a repair callback recovers a fixable spec', () => {
  // The candidate uses match/case (unrepresentable); the repair rewrites it to an if,
  // standing in for an automated "repair" pass that retries once.
  const broken = {
    type: 'macro_demo_fix', name: 'Fix', slots: [{ id: 'v', label: 'V', type: 'value', default: 'x' }],
    pythonTemplate: 'match {v}:\n    case 1:\n        pass',
  };
  const repair = (spec) => ({ ...spec, pythonTemplate: 'if {v} == 1:\n    pass' });
  const plan = A.planSynthesis([broken], P, repair);
  expect(plan.rejected).toEqual([]);
  expect(plan.repaired.map(s => s.type)).toEqual(['macro_demo_fix']);
  expect(plan.toRegister.map(s => s.type)).toEqual(['macro_demo_fix']);
  expect(plan.toRegister[0].pythonTemplate).toContain('if');
});
```

- [ ] **Step 2: Run test to verify it fails (then passes)**

Run: `npx playwright test tests/synthesize_blocks.spec.js -g "repair callback"`
Expected: PASS already if Task 1's repair branch is correct; if it FAILS, fix `planSynthesis` (the repair branch is the code under test — do not weaken the test).

- [ ] **Step 3: Commit**

```bash
git add tests/synthesize_blocks.spec.js
git commit -m "test(synthesis): repair loop recovers a fixable spec"
```

---

### Task 3: `synthesizeBlocks` registers the survivors (browser)

**Files:**
- Modify: `src/utils/libraryAbstraction.js` (add `synthesizeBlocks` method to `LibraryAbstractionEngine`)
- Test: `tests/synthesize_blocks_browser.spec.js`

- [ ] **Step 1: Write the failing test**

```javascript
const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:3000/';

test('synthesizeBlocks registers only oracle-passing specs in a live workspace', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__blockpyEngine && window.BlockPyParser && window.Blockly, null, { timeout: 15000 });
  const report = await page.evaluate(() => {
    const eng = window.__blockpyEngine;
    const specs = [
      { type: 'macro_syn_ok', name: 'OK', slots: [{ id: 'n', label: 'N', type: 'number', default: 1 }], pythonTemplate: 'x = {n} + 1' },
      { type: 'macro_syn_bad', name: 'Bad', slots: [{ id: 'v', label: 'V', type: 'value', default: 'x' }], pythonTemplate: 'match {v}:\n    case 1:\n        pass' },
    ];
    const r = eng.synthesizeBlocks(specs);
    return {
      registered: r.registered, rejected: r.rejected.map(x => x.type),
      okExists: !!window.Blockly.Blocks['macro_syn_ok'],
      badExists: !!window.Blockly.Blocks['macro_syn_bad'],
    };
  });
  expect(report.registered).toEqual(['macro_syn_ok']);
  expect(report.rejected).toEqual(['macro_syn_bad']);
  expect(report.okExists).toBe(true);
  expect(report.badExists).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: free port 3000, then `npx playwright test tests/synthesize_blocks_browser.spec.js`
Expected: FAIL — `eng.synthesizeBlocks is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `LibraryAbstractionEngine` (in `src/utils/libraryAbstraction.js`):

```javascript
  // [Phase 1] Plan via the oracle gate, then register the survivors as real blocks.
  // Returns { registered: type[], repaired: type[], rejected: {type,error}[] }.
  synthesizeBlocks(specs, repair) {
    const P = (typeof window !== 'undefined') ? window.BlockPyParser : null;
    const plan = planSynthesis(specs, P, repair);
    const registered = [];
    for (const spec of plan.toRegister) {
      const res = this.registerMacroBlock(spec, P);
      if (res && res.ok) registered.push(res.type);
      else plan.rejected.push({ type: spec.type, error: 'registration failed' });
    }
    return { registered, repaired: plan.repaired.map(s => s.type), rejected: plan.rejected };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: free port 3000, then `npx playwright test tests/synthesize_blocks_browser.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/libraryAbstraction.js tests/synthesize_blocks_browser.spec.js
git commit -m "feat(synthesis): synthesizeBlocks registers oracle-passing specs (browser)"
```

---

### Task 4: Regression gate

- [ ] **Step 1:** Run `npm run test:validity` — Expected: `87 passed` (no regression in the deterministic round-trip gate).
- [ ] **Step 2:** Run `npx playwright test tests/synthesize_blocks.spec.js` — Expected: all pass.
- [ ] **Step 3:** No commit (verification only). If anything fails, fix before proceeding to Work-Unit 1.2.

---

## 4. After Work-Unit 1.1
Write the Work-Unit 1.2 (Pyodide introspection) spec + plan: a probe returning real `{functions, constants, classes}` for an imported module, mapped to draft specs that feed `synthesizeBlocks`. Then 1.3 (AI spec generation from the purpose prompt) and 1.4 (corpus eval, Phase 2).
