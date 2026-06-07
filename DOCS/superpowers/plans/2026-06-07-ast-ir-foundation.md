# AST-IR Foundation + Claude↔Codex Loop — Implementation Plan (Plan 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written Python parser with a CPython-3.12 `ast`-based single IR, prove a lossless block↔Python round-trip on a walking-skeleton subset, and stand up the raw=0 coverage harness + the per-slice Claude↔Codex review loop that subsequent node families ride on.

**Architecture:** Python text is parsed by Pyodide's real `ast.parse()` (CPython 3.12) and serialized to a JSON **IR**. Pure-JS modules map IR↔Blockly JSON (one schema, two directions). Block→Python goes block→IR→`ast.unparse()` (in Pyodide), so round-trip parity is a structural property of the shared IR, not a field-name convention. A coverage test enumerates the closed 3.12 node set and fails if any in-scope node lacks a mapping (this is the raw=0 invariant, mechanized).

**Tech Stack:** React 19 + Vite, Blockly (CDN), Pyodide 0.26.4 (CPython 3.12), Playwright e2e, Codex CLI 0.137.0 (`codex exec review`).

**Scope of Plan 1:** Phase 0 (teardown) + Phase 1 (walking skeleton) + Phase 2 (coverage/round-trip harness) + first node family (literals/Name/Assign). Remaining node families are repeated `/loop` slices using the worklist (§Worklist) and template (§Per-Slice Template) at the end. Comment preservation (Phase 3), desugar-as-feature (Phase 4), and dynamic blocks (Phase 5) are deferred to later plans.

Spec: `DOCS/superpowers/specs/2026-06-07-blockpy-ast-ir-redesign-design.md`

---

## File Structure

- Create: `src/utils/pyAstBridge.js` — Python source string `PY_AST_TO_JSON` (runs in Pyodide: `ast.parse` → JSON) and `PY_IR_TO_CODE` (`ast.unparse`); JS helpers `pythonToIR(pyodide, code)` and `irToPython(pyodide, ir)`. Attaches `window.BlockPyAstBridge`, also `module.exports`.
- Create: `src/utils/irToBlockly.js` — pure JS `irToBlockly(ir)` (IR → Blockly workspace JSON) + the `NODE_POLICY` table (the closed 3.12 map). Attaches `window.BlockPyIR.irToBlockly`, `module.exports`.
- Create: `src/utils/blocklyToIr.js` — pure JS `blocklyToIr(workspaceJson)` (Blockly JSON → IR). Attaches `window.BlockPyIR.blocklyToIr`, `module.exports`.
- Create: `src/utils/irBlocks.js` — defines `Blockly.Blocks[...]` + `Blockly.Python` shims for the new IR block types added per slice (loaded for side effects).
- Delete: `src/utils/interpreter.js`.
- Modify: `src/App.jsx` — remove Step/Pause state, buttons, `interpreterRef`; route Convert through the new IR pipeline.
- Modify: `src/components/Stage.jsx` — remove Step/Pause controls (keep sprite render for demo).
- Modify: `src/utils/parser.js` — remove Step/Pause-only sprite interpreter hooks if any (grep-guided); keep block defs for now.
- Test (Playwright, browser/Pyodide): `tests/ir_roundtrip.spec.js`, `tests/ir_coverage.spec.js`.
- Test (node, pure JS): `tests/ir_unit.spec.js` via the existing require()-able pattern.

**IR shape (canonical):** a node is `{ type: <ast.NodeName>, ...fields }`. Child nodes nest; lists are JS arrays; primitives are JSON scalars. `lineno`/`col_offset` carried as `_loc` when present. Example: `x = 1` →
```json
{"type":"Module","body":[
  {"type":"Assign","targets":[{"type":"Name","id":"x"}],
   "value":{"type":"Constant","value":1}}]}
```

---

## Phase 0 — Teardown (drop the second engine)

### Task 0.1: Delete the JS interpreter

**Files:**
- Delete: `src/utils/interpreter.js`
- Modify: `src/main.jsx` (remove its side-effect import)

- [ ] **Step 1: Find all references**

Run: `git grep -n "BlockPyInterpreter\|ASTInterpreter\|interpreter.js\|interpreterRef"`
Expected: matches in `src/main.jsx`, `src/App.jsx`, possibly `src/utils/parser.js`, `src/components/Stage.jsx`.

- [ ] **Step 2: Remove the import in main.jsx**

In `src/main.jsx`, delete the line importing `./utils/interpreter.js`.

- [ ] **Step 3: Delete the file**

```bash
git rm src/utils/interpreter.js
```

- [ ] **Step 4: Verify the app still boots**

Run: `npm run dev` (separate shell) then `npx playwright test tests/e2e.spec.js -g "load"` (or load `http://localhost:3000` and confirm no console error about `BlockPyInterpreter`).
Expected: app loads; no `ReferenceError`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: delete JS ASTInterpreter (Step/Pause engine)"
```

### Task 0.2: Strip Step/Pause UI + state

**Files:**
- Modify: `src/App.jsx` (remove `interpreterRef` decl ~line 60, Step/Pause handlers, related state)
- Modify: `src/components/Stage.jsx` (remove Step/Pause buttons)

- [ ] **Step 1: Find the UI + state**

Run: `git grep -n "Step\|Pause\|interpreterRef\|spriteState" src/App.jsx src/components/Stage.jsx`
Expected: handler functions, JSX buttons, refs.

- [ ] **Step 2: Remove handlers, buttons, refs**

Delete the Step/Pause `<button>` elements in `Stage.jsx`, their `onClick` handlers in `App.jsx`, the `interpreterRef` declaration, and any state used only by them (do NOT remove `spriteState` if the Run/Pyodide sprite path still uses it — confirm via grep).

- [ ] **Step 3: Verify**

Run: load app, click Run on `print("hi")` — Pyodide still works; Step/Pause gone.
Expected: Run path intact; no console errors; no dead Step/Pause buttons.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: remove Step/Pause UI and state from App/Stage"
```

---

## Phase 1 — Walking-skeleton single-IR round-trip

### Task 1.1: Python → IR and IR → Python via Pyodide

**Files:**
- Create: `src/utils/pyAstBridge.js`
- Test: `tests/ir_roundtrip.spec.js`

- [ ] **Step 1: Write the failing browser test**

```js
// tests/ir_roundtrip.spec.js
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3000');
  // Ensure Pyodide is up (Run once warms window.__pyodide)
  await page.waitForFunction(() => !!window.__pyodide, null, { timeout: 120000 });
});

test('python->IR->python is identity for simple assign', async ({ page }) => {
  const out = await page.evaluate(async () => {
    const B = window.BlockPyAstBridge;
    const ir = await B.pythonToIR(window.__pyodide, 'x = 1\n');
    return { ir, code: await B.irToPython(window.__pyodide, ir) };
  });
  expect(out.ir.type).toBe('Module');
  expect(out.code.trim()).toBe('x = 1');
});
```

- [ ] **Step 2: Run it, confirm failure**

Run: `npx playwright test tests/ir_roundtrip.spec.js -g "identity for simple assign"`
Expected: FAIL — `window.BlockPyAstBridge` undefined.

- [ ] **Step 3: Implement the bridge**

```js
// src/utils/pyAstBridge.js
// Real CPython 3.12 ast (via Pyodide) <-> JSON IR. No hand-written parser.

const PY_AST_TO_JSON = `
import ast, json
def _to_ir(node):
    if isinstance(node, ast.AST):
        d = {"type": type(node).__name__}
        for f in node._fields:
            d[f] = _to_ir(getattr(node, f, None))
        if hasattr(node, "lineno"):
            d["_loc"] = [node.lineno, node.col_offset]
        return d
    if isinstance(node, list):
        return [_to_ir(x) for x in node]
    return node  # primitive (str/int/float/bool/None)
def _parse(src):
    return json.dumps(_to_ir(ast.parse(src)))
`;

const PY_IR_TO_CODE = `
import ast, json
def _from_ir(d):
    if isinstance(d, dict) and "type" in d:
        cls = getattr(ast, d["type"])
        kwargs = {}
        for f in cls._fields:
            kwargs[f] = _from_ir(d.get(f))
        node = cls(**kwargs)
        return ast.fix_missing_locations(node)
    if isinstance(d, list):
        return [_from_ir(x) for x in d]
    return d
def _unparse(js):
    return ast.unparse(_from_ir(json.loads(js)))
`;

async function pythonToIR(pyodide, code) {
  pyodide.runPython(PY_AST_TO_JSON);
  const js = pyodide.globals.get('_parse')(code);
  return JSON.parse(js);
}

async function irToPython(pyodide, ir) {
  pyodide.runPython(PY_IR_TO_CODE);
  return pyodide.globals.get('_unparse')(JSON.stringify(ir));
}

const BlockPyAstBridge = { pythonToIR, irToPython, PY_AST_TO_JSON, PY_IR_TO_CODE };
if (typeof window !== 'undefined') window.BlockPyAstBridge = BlockPyAstBridge;
if (typeof module !== 'undefined') module.exports = BlockPyAstBridge;
```

- [ ] **Step 4: Wire the side-effect import**

In `src/main.jsx`, add `import './utils/pyAstBridge.js';` next to the other `src/utils/*` imports.

- [ ] **Step 5: Run the test, confirm pass**

Run: `npx playwright test tests/ir_roundtrip.spec.js -g "identity for simple assign"`
Expected: PASS.

- [ ] **Step 6: Codex review + commit** (see §Per-Slice Template, steps R1–R4)

### Task 1.2: IR → Blockly and Blockly → IR for Module/Assign/Name/Constant

**Files:**
- Create: `src/utils/irToBlockly.js`, `src/utils/blocklyToIr.js`, `src/utils/irBlocks.js`
- Test: `tests/ir_unit.spec.js` (node-level, require()-able)

- [ ] **Step 1: Write the failing node test**

```js
// tests/ir_unit.spec.js
const { test, expect } = require('@playwright/test');
require('../src/utils/irToBlockly.js');
require('../src/utils/blocklyToIr.js');

const IR = { type: 'Module', body: [
  { type: 'Assign', targets: [{ type: 'Name', id: 'x' }],
    value: { type: 'Constant', value: 1 } } ] };

test('IR -> Blockly -> IR is identity for x = 1', () => {
  const bj = global.BlockPyIR.irToBlockly(IR);
  const back = global.BlockPyIR.blocklyToIr(bj);
  expect(back).toEqual(IR);
});
```

- [ ] **Step 2: Run it, confirm failure**

Run: `npx playwright test tests/ir_unit.spec.js -g "identity for x = 1"`
Expected: FAIL — `BlockPyIR` undefined.

- [ ] **Step 3: Implement `irToBlockly.js` (skeleton + first family)**

```js
// src/utils/irToBlockly.js
// Pure JS: canonical IR -> Blockly workspace JSON. NODE_POLICY is the closed map.

const NODE_POLICY = {
  Module: 'ROOT', Assign: 'DB', Name: 'DB', Constant: 'DB',
  // ... filled in per slice; see DOCS spec §5 for the full closed set
};

function blk(type, fields = {}, inputs = {}) {
  return { type, fields, inputs };
}

function exprToBlock(node) {
  switch (node.type) {
    case 'Name':     return blk('ir_name', { ID: node.id });
    case 'Constant': return blk('ir_const', { VALUE: JSON.stringify(node.value) });
    default: throw new Error('no exprToBlock for ' + node.type);
  }
}

function stmtToBlock(node) {
  switch (node.type) {
    case 'Assign':
      return blk('ir_assign',
        { TARGET: node.targets[0].id },                 // single-target slice
        { VALUE: { block: exprToBlock(node.value) } });
    default: throw new Error('no stmtToBlock for ' + node.type);
  }
}

function irToBlockly(ir) {
  if (ir.type !== 'Module') throw new Error('root must be Module');
  const top = ir.body.map(stmtToBlock);
  // chain statements via next
  for (let i = 0; i < top.length - 1; i++) top[i].next = { block: top[i + 1] };
  return { blocks: { languageVersion: 0, blocks: top.length ? [top[0]] : [] } };
}

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIR = Object.assign(api.BlockPyIR || {}, { irToBlockly, NODE_POLICY });
if (typeof module !== 'undefined') module.exports = api.BlockPyIR;
```

- [ ] **Step 4: Implement `blocklyToIr.js` (inverse, first family)**

```js
// src/utils/blocklyToIr.js
function blockToExpr(b) {
  switch (b.type) {
    case 'ir_name':  return { type: 'Name', id: b.fields.ID };
    case 'ir_const': return { type: 'Constant', value: JSON.parse(b.fields.VALUE) };
    default: throw new Error('no blockToExpr for ' + b.type);
  }
}
function blockToStmt(b) {
  switch (b.type) {
    case 'ir_assign':
      return { type: 'Assign',
        targets: [{ type: 'Name', id: b.fields.TARGET }],
        value: blockToExpr(b.inputs.VALUE.block) };
    default: throw new Error('no blockToStmt for ' + b.type);
  }
}
function blocklyToIr(ws) {
  const body = [];
  let cur = ws.blocks.blocks[0];
  while (cur) { body.push(blockToStmt(cur)); cur = cur.next && cur.next.block; }
  return { type: 'Module', body };
}
const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIR = Object.assign(api.BlockPyIR || {}, { blocklyToIr });
if (typeof module !== 'undefined') module.exports = api.BlockPyIR;
```

- [ ] **Step 5: Define the Blockly blocks in `irBlocks.js`**

```js
// src/utils/irBlocks.js — visual defs for IR block types (side-effect load)
const Blockly = (typeof window !== 'undefined' && window.Blockly);
if (Blockly) {
  Blockly.Blocks['ir_name'] = { init() {
    this.appendDummyInput().appendField(new Blockly.FieldTextInput('x'), 'ID');
    this.setOutput(true); this.setColour('#5b80a5'); } };
  Blockly.Blocks['ir_const'] = { init() {
    this.appendDummyInput().appendField(new Blockly.FieldTextInput('1'), 'VALUE');
    this.setOutput(true); this.setColour('#a55b80'); } };
  Blockly.Blocks['ir_assign'] = { init() {
    this.appendValueInput('VALUE')
        .appendField(new Blockly.FieldTextInput('x'), 'TARGET').appendField('=');
    this.setPreviousStatement(true); this.setNextStatement(true);
    this.setColour('#5b5ba5'); } };
}
if (typeof module !== 'undefined') module.exports = {};
```

- [ ] **Step 6: Run the node test, confirm pass**

Run: `npx playwright test tests/ir_unit.spec.js -g "identity for x = 1"`
Expected: PASS.

- [ ] **Step 7: Codex review + commit** (§Per-Slice Template R1–R4)

### Task 1.3: End-to-end skeleton — Python → blocks → Python in the live app

**Files:**
- Modify: `src/App.jsx` (`syncCodeToBlocks` to use the IR pipeline behind a flag), `src/main.jsx` (import `irToBlockly.js`, `blocklyToIr.js`, `irBlocks.js`)
- Test: `tests/ir_roundtrip.spec.js`

- [ ] **Step 1: Write the failing e2e test**

```js
test('full pipeline: x = 1 -> blocks -> x = 1', async ({ page }) => {
  const code = await page.evaluate(async () => {
    const B = window.BlockPyAstBridge, IRm = window.BlockPyIR;
    const ir = await B.pythonToIR(window.__pyodide, 'x = 1\n');
    const bj = IRm.irToBlockly(ir);
    const back = IRm.blocklyToIr(bj);
    return await B.irToPython(window.__pyodide, back);
  });
  expect(code.trim()).toBe('x = 1');
});
```

- [ ] **Step 2: Run, confirm fail (modules not imported in app yet)**

Run: `npx playwright test tests/ir_roundtrip.spec.js -g "full pipeline"`
Expected: FAIL — `window.BlockPyIR` undefined.

- [ ] **Step 3: Add side-effect imports in `main.jsx`**

Add: `import './utils/irToBlockly.js'; import './utils/blocklyToIr.js'; import './utils/irBlocks.js';`

- [ ] **Step 4: Run, confirm pass**

Run: `npx playwright test tests/ir_roundtrip.spec.js -g "full pipeline"`
Expected: PASS.

- [ ] **Step 5: Codex review + commit** (§Per-Slice Template R1–R4)

---

## Phase 2 — raw=0 coverage + round-trip property harness

### Task 2.1: Coverage test (mechanizes raw=0)

**Files:**
- Test: `tests/ir_coverage.spec.js`
- Create: `tests/fixtures/py312_nodes.json` (the closed in-scope set, derived from CPython 3.12 `ast`)

- [ ] **Step 1: Generate the authoritative 3.12 node list**

Run (in Pyodide via a throwaway test, or copy from spec §5):
```py
import ast
[n for n in dir(ast) if isinstance(getattr(ast,n),type) and issubclass(getattr(ast,n),ast.AST)]
```
Save the in-scope stmt/expr/pattern/helper names (exclude SKIP set from spec §5, exclude TemplateStr/Interpolation as out-of-3.12) to `tests/fixtures/py312_nodes.json` as `{ "DB_OR_SUGAR": [...], "HELPER": [...], "FIELD": [...], "SKIP": [...] }`.

- [ ] **Step 2: Write the coverage test**

```js
// tests/ir_coverage.spec.js
const { test, expect } = require('@playwright/test');
require('../src/utils/irToBlockly.js');
const nodes = require('./fixtures/py312_nodes.json');

test('every in-scope 3.12 node has a NODE_POLICY entry (raw=0)', () => {
  const policy = global.BlockPyIR.NODE_POLICY;
  const missing = [...nodes.DB_OR_SUGAR, ...nodes.HELPER, ...nodes.FIELD]
    .filter(n => !(n in policy));
  expect(missing, `unmapped nodes => would fall to raw: ${missing.join(', ')}`).toEqual([]);
});
```

- [ ] **Step 3: Run, confirm fail (most nodes unmapped yet)**

Run: `npx playwright test tests/ir_coverage.spec.js`
Expected: FAIL — long `missing` list. **This failing list IS the worklist.**

- [ ] **Step 4: Make it pass for the first family only by listing the rest as `PENDING`**

In `irToBlockly.js`, seed every in-scope node in `NODE_POLICY` with its target policy from spec §5 (value `'DB'`/`'SUGAR'`/`'HELPER'`/`'FIELD'`/`'PENDING'`). `PENDING` counts as mapped-for-policy but a second assertion (Step 5) tracks real handler coverage.

- [ ] **Step 5: Add the handler-coverage assertion (the real raw=0 gate)**

```js
test('every DB/SUGAR node has an irToBlockly handler', () => {
  const policy = global.BlockPyIR.NODE_POLICY;
  const dbNodes = Object.entries(policy)
    .filter(([,p]) => p === 'DB' || p === 'SUGAR').map(([n]) => n);
  const unhandled = dbNodes.filter(n => !global.BlockPyIR.__handled?.has(n));
  // __handled is a Set the irToBlockly switch registers into; see Task note.
  expect(unhandled, `nodes without a block handler: ${unhandled.join(', ')}`).toEqual([]);
});
```
Note: have `exprToBlock`/`stmtToBlock` register handled types into `BlockPyIR.__handled`. This second test stays RED until all families are done — it is the **definition-of-done for the whole worklist** and the loop's exit condition.

- [ ] **Step 6: Commit** (coverage harness; second assertion expected RED)

```bash
git add -A && git commit -m "test: raw=0 coverage harness (policy + handler gates)"
```

### Task 2.2: Round-trip property test (corpus)

**Files:**
- Test: `tests/ir_roundtrip.spec.js`
- Create: `tests/fixtures/roundtrip_corpus.txt` (one Python snippet per line/block)

- [ ] **Step 1: Seed the corpus with skeleton-covered snippets**

`x = 1`, `y = "hi"`, `a = True` — only what the first family supports. Grow the corpus as each slice lands.

- [ ] **Step 2: Write the property test**

```js
test('round-trip corpus: python -> blocks -> python preserves meaning', async ({ page }) => {
  const fs = require('fs');
  const cases = fs.readFileSync('tests/fixtures/roundtrip_corpus.txt','utf8')
    .split('\n').filter(Boolean);
  for (const src of cases) {
    const out = await page.evaluate(async (s) => {
      const B = window.BlockPyAstBridge, IRm = window.BlockPyIR;
      const ir = await B.pythonToIR(window.__pyodide, s + '\n');
      const back = IRm.blocklyToIr(IRm.irToBlockly(ir));
      // compare normalized ASTs (meaning), not raw text
      const a = await B.irToPython(window.__pyodide, ir);
      const b = await B.irToPython(window.__pyodide, back);
      return { a, b };
    }, src);
    expect(out.b).toBe(out.a);
  }
});
```

- [ ] **Step 3: Run, confirm pass for the seeded corpus**

Run: `npx playwright test tests/ir_roundtrip.spec.js -g "round-trip corpus"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: round-trip property harness + seed corpus"
```

---

## Worklist (ordered slices for `/loop`)

Each slice = one node family. Build order: common → rare. The loop walks this list top-to-bottom; each is implemented with the §Per-Slice Template. Done when `ir_coverage.spec.js` handler-gate is green.

1. **Literals & names** — Constant, Name *(done in Phase 1)*
2. **Collections** — List, Tuple, Set, Dict
3. **Operators** — BinOp, UnaryOp, BoolOp (ops as FIELD), Compare (non-chained)
4. **Assignment forms** — AugAssign, AnnAssign, multi-target Assign, tuple unpack
5. **Attribute/Subscript/Slice** — Attribute, Subscript, Slice, Starred
6. **Calls** — Call, keyword, Starred-arg *(this is Tier B; un-promoted lib calls land here)*
7. **Control flow** — If, While, For (+ else), Break, Continue, Pass
8. **Functions** — FunctionDef, arguments/arg, Return, Lambda, Global, Nonlocal
9. **Classes** — ClassDef
10. **Imports** — Import, ImportFrom, alias
11. **Exceptions/with** — Try, ExceptHandler, Raise, Assert, With/withitem, Delete
12. **SUGAR** — ListComp/SetComp/DictComp/GeneratorExp, IfExp, chained Compare (+ desugar pass — but that is Phase 4; here only the dedicated blocks)
13. **Async** — AsyncFunctionDef, Await, AsyncFor, AsyncWith, Yield, YieldFrom, NamedExpr
14. **f-strings (LATE)** — JoinedStr, FormattedValue
15. **match (LATE)** — Match, match_case + 8 pattern nodes
16. **TypeAlias (LATE)** — TypeAlias, type_param

---

## Per-Slice Template (the `/loop` body)

For each worklist slice, run these steps. This is the loop body; the loop is driven by `/loop` (self-paced).

- [ ] **T1 — Write failing tests:** add the family's snippets to `tests/fixtures/roundtrip_corpus.txt` and a focused `ir_unit` identity test for each new node. Run; confirm RED.
- [ ] **T2 — Implement IR↔block mapping:** add `case` arms in `irToBlockly.js` (`exprToBlock`/`stmtToBlock`, register into `__handled`), the inverse in `blocklyToIr.js`, the `Blockly.Blocks[...]` defs in `irBlocks.js`, and set the `NODE_POLICY` entries to their real policy. For library `Call` nodes, ensure the generic call/attribute block (Tier B) is the fallback — never raw.
- [ ] **T3 — Self-verify (gate before Codex):** run the family unit tests + `tests/ir_roundtrip.spec.js -g "round-trip corpus"` + `tests/ir_coverage.spec.js`. All must be green except the global handler-gate (which shrinks). If a render concern exists, run the `blockpy-roundtrip-verify` skill. **Do not proceed to Codex with failing self-tests.**
- [ ] **R1 — Codex review (automated):**
  ```bash
  codex exec review "$(cat scripts/codex-review-prompt.md)"
  ```
  Capture stdout.
- [ ] **R2 — Triage feedback (receiving-code-review discipline):** for each finding, verify the claim against the code/tests. Valid → fix. Wrong → record a one-line rebuttal. Disagreement that changes scope → escalate to the user.
- [ ] **R3 — Re-verify:** re-run T3's test set after fixes. Green.
- [ ] **R4 — Gate + commit:** only when Codex returns no BLOCKING findings (or all blocking are resolved/justified):
  ```bash
  git add -A && git commit -m "feat(ir): <family> blocks — IR<->Blockly round-trip + coverage"
  ```
  Advance the worklist pointer. If the global handler-gate is now green, the worklist is complete.

---

## Self-Review (completed by author)

- **Spec coverage:** Phase 0 (teardown) ✓ Tasks 0.1–0.2. Phase 1 (single IR, walking skeleton) ✓ Tasks 1.1–1.3. Phase 2 (raw=0 coverage + round-trip harness) ✓ Tasks 2.1–2.2. raw=0 mechanized ✓ (coverage handler-gate). 3-tier library calls ✓ (worklist #6 + T2 Tier-B note). Claude↔Codex loop ✓ (§Per-Slice Template). Deferred (noted in scope): comment preservation (Phase 3), desugar-as-feature (Phase 4), dynamic blocks (Phase 5) → later plans.
- **Placeholder scan:** node families beyond #1 are intentionally enumerated as a worklist with a concrete shared template (not per-task placeholders) — each rides identical, fully-specified steps. No `TODO`/`TBD` in code blocks.
- **Type consistency:** block types `ir_name`/`ir_const`/`ir_assign`, fields `ID`/`VALUE`/`TARGET`, and module globals `BlockPyAstBridge`/`BlockPyIR.{irToBlockly,blocklyToIr,NODE_POLICY,__handled}` are used consistently across Tasks 1.1–2.2.
