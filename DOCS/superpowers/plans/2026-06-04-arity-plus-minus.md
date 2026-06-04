# MakeCode-style +/- Arity Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MakeCode-style inline `⊖`/`⊕` buttons to dynamic value-input blocks so users can add/remove argument slots by clicking, preserving child connections.

**Architecture:** A single `enableArity(blockDef, min)` wrapper re-wraps each block's existing `updateShape_` to append two `Blockly.FieldImage` buttons after rebuild, and installs a `changeArity_(delta)` method that snapshots child connections by input name, mutates `itemCount_`, rebuilds, and restores connections. No parser/generator/serialization changes — `itemCount_` is already serialized and the Python generators already loop over it.

**Tech Stack:** Plain JS (`src/utils/parser.js`, global `window.BlockPyParser`), CDN Blockly (`Blockly.FieldImage`, `Blockly.serialization`), Playwright e2e.

---

## File Structure

- `src/utils/parser.js` — all production changes:
  - Two SVG data-URI constants (`ARITY_MINUS_SVG`, `ARITY_PLUS_SVG`).
  - `appendArityButtons(block)` + `enableArity(def, min)` helpers.
  - 8 `enableArity(...)` calls (7 custom blocks + built-in `lists_create_with`).
- `tests/arity_buttons.spec.js` — new Playwright regression.

Background: target blocks all already have `itemCount_` + `saveExtraState`/`loadExtraState`, a trailing dummy input (`TAIL`/`CLOSE`/close), and a Python generator that loops `itemCount_`. The custom blocks: `print_multi` (~4458), `func_call`/`func_call_stmt` (factory ~4500), `method_call` (~4548), `tuple_create`/`set_create` (makeCollectionBlock ~5446/5464), `dict_create` (~5480). `lists_create_with` is Blockly's built-in (same `itemCount_`/`ADDn` scheme).

---

### Task 1: Arity helpers + wire the 7 custom blocks

**Files:**
- Modify: `src/utils/parser.js` — add SVG constants + `appendArityButtons` + `enableArity` near the end of the block-definition region (after `dict_create`'s generator, before the `Blockly.Python.finish` override added in the method_def work); add 7 `enableArity(...)` calls.
- Test: `tests/arity_buttons.spec.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/arity_buttons.spec.js`:

```js
// Regression for MakeCode-style +/- arity buttons on dynamic value-input blocks.
// Buttons' onClick only calls block.changeArity_(±1), so tests drive that method
// directly (robust vs simulating pixel clicks on the SVG field).
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000';

async function bootWorkspace(page) {
  await page.goto(APP_URL);
  await page.waitForFunction(() => !!window.Blockly && !!window.__blocklyWorkspace, null, { timeout: 15000 });
}

// Load a single block (optionally with extraState) and return an in-page handle id.
async function newBlock(page, type, extraState) {
  return await page.evaluate(({ type, extraState }) => {
    const ws = window.__blocklyWorkspace;
    ws.clear();
    const json = { blocks: { languageVersion: 0, blocks: [Object.assign({ type }, extraState ? { extraState } : {})] } };
    window.Blockly.serialization.workspaces.load(json, ws);
    return ws.getTopBlocks(false)[0].id;
  }, { type, extraState });
}

test.describe('arity +/- buttons', () => {
  test('changeArity_(+1) adds a slot and the PLUS field exists', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'func_call', { itemCount: 1 });
    const r = await page.evaluate((id) => {
      const b = window.__blocklyWorkspace.getBlockById(id);
      const before = b.itemCount_;
      b.changeArity_(1);
      return { before, after: b.itemCount_, hasArg1: !!b.getInput('ARG1'), hasPlus: !!b.getField('PLUS') };
    }, id);
    expect(r.before).toBe(1);
    expect(r.after).toBe(2);
    expect(r.hasArg1).toBe(true);
    expect(r.hasPlus).toBe(true);
  });

  test('changeArity_(-1) removes the last slot', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'func_call', { itemCount: 2 });
    const r = await page.evaluate((id) => {
      const b = window.__blocklyWorkspace.getBlockById(id);
      b.changeArity_(-1);
      return { after: b.itemCount_, hasArg1: !!b.getInput('ARG1') };
    }, id);
    expect(r.after).toBe(1);
    expect(r.hasArg1).toBe(false);
  });

  test('min guard: func_call cannot go below 0 and MINUS hidden at min', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'func_call', { itemCount: 0 });
    const r = await page.evaluate((id) => {
      const b = window.__blocklyWorkspace.getBlockById(id);
      const hasMinusAtMin = !!b.getField('MINUS');
      b.changeArity_(-1);
      return { after: b.itemCount_, hasMinusAtMin };
    }, id);
    expect(r.after).toBe(0);
    expect(r.hasMinusAtMin).toBe(false);
  });

  test('print_multi min is 1', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'print_multi', { itemCount: 1 });
    const after = await page.evaluate((id) => {
      const b = window.__blocklyWorkspace.getBlockById(id);
      b.changeArity_(-1);
      return b.itemCount_;
    }, id);
    expect(after).toBe(1);
  });

  test('child connection on ARG0 is preserved across +1', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'func_call', { itemCount: 1 });
    const stillConnected = await page.evaluate((id) => {
      const ws = window.__blocklyWorkspace;
      const b = ws.getBlockById(id);
      const child = ws.newBlock('text');
      child.initSvg && child.initSvg();
      b.getInput('ARG0').connection.connect(child.outputConnection);
      const childId = child.id;
      b.changeArity_(1);
      const c = b.getInput('ARG0').connection.targetBlock();
      return !!c && c.id === childId;
    }, id);
    expect(stillConnected).toBe(true);
  });

  test('itemCount persists through save/load', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'func_call', { itemCount: 1 });
    const saved = await page.evaluate((id) => {
      const ws = window.__blocklyWorkspace;
      ws.getBlockById(id).changeArity_(1);
      const state = window.Blockly.serialization.workspaces.save(ws);
      return state.blocks.blocks[0].extraState.itemCount;
    }, id);
    expect(saved).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/arity_buttons.spec.js`
Expected: FAIL — `b.changeArity_ is not a function` (helper not wired yet).

- [ ] **Step 3: Add the helpers + SVG constants**

In `src/utils/parser.js`, find the `dict_create` Python generator (the function assigned to `Blockly.Python['dict_create']`, ends a few lines after line ~5496's `updateShape_`). Immediately AFTER the `dict_create` block + generator + its `forBlock` alias, insert:

```js
// ── MakeCode-style +/- arity buttons ────────────────────────────────────────────
// White-circle minus / plus icons (18x18, #575E75 glyph). Inline data-URIs so no asset
// pipeline is needed.
const ARITY_MINUS_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCI+PGNpcmNsZSBjeD0iOSIgY3k9IjkiIHI9IjgiIGZpbGw9IiNmZmYiIHN0cm9rZT0iI2NjYyIvPjxyZWN0IHg9IjQuNSIgeT0iOCIgd2lkdGg9IjkiIGhlaWdodD0iMiIgcng9IjEiIGZpbGw9IiM1NzVFNzUiLz48L3N2Zz4=';
const ARITY_PLUS_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCI+PGNpcmNsZSBjeD0iOSIgY3k9IjkiIHI9IjgiIGZpbGw9IiNmZmYiIHN0cm9rZT0iI2NjYyIvPjxyZWN0IHg9IjQuNSIgeT0iOCIgd2lkdGg9IjkiIGhlaWdodD0iMiIgcng9IjEiIGZpbGw9IiM1NzVFNzUiLz48cmVjdCB4PSI4IiB5PSI0LjUiIHdpZHRoPSIyIiBoZWlnaHQ9IjkiIHJ4PSIxIiBmaWxsPSIjNTc1RTc1Ii8+PC9zdmc+';

// Append ⊖ (only when itemCount_ > arityMin_) and ⊕ FieldImage buttons to the block's
// trailing input. Runs at the end of every updateShape_, so buttons are rebuilt fresh
// each shape change (no duplication).
function appendArityButtons(block) {
  if (!block.inputList || block.inputList.length === 0 || !Blockly.FieldImage) return;
  const last = block.inputList[block.inputList.length - 1];
  const min = block.arityMin_ || 0;
  if ((block.itemCount_ || 0) > min) {
    last.appendField(new Blockly.FieldImage(ARITY_MINUS_SVG, 18, 18, '-', function () {
      const b = this.getSourceBlock && this.getSourceBlock();
      if (b) b.changeArity_(-1);
    }), 'MINUS');
  }
  last.appendField(new Blockly.FieldImage(ARITY_PLUS_SVG, 18, 18, '+', function () {
    const b = this.getSourceBlock && this.getSourceBlock();
    if (b) b.changeArity_(1);
  }), 'PLUS');
}

// Wrap a dynamic-arity block definition: append +/- buttons after its updateShape_, and
// install changeArity_ which preserves child connections across the rebuild.
function enableArity(def, min) {
  if (!def || typeof def.updateShape_ !== 'function') return;
  const orig = def.updateShape_;
  def.arityMin_ = min;
  def.updateShape_ = function () {
    orig.call(this);
    appendArityButtons(this);
  };
  def.changeArity_ = function (delta) {
    const next = (this.itemCount_ || 0) + delta;
    if (next < (this.arityMin_ || 0)) return;
    const prevGroup = (Blockly.Events && Blockly.Events.getGroup && Blockly.Events.getGroup()) || false;
    if (Blockly.Events && Blockly.Events.setGroup) Blockly.Events.setGroup(true);
    // 1. snapshot child connections by input name
    const saved = {};
    for (const input of this.inputList) {
      if (input.connection && input.connection.targetConnection) {
        saved[input.name] = input.connection.targetConnection;
      }
    }
    // 2. mutate count + rebuild shape
    this.itemCount_ = next;
    this.updateShape_();
    // 3. restore connections to same-named inputs that still exist
    for (const name in saved) {
      const input = this.getInput(name);
      if (input && input.connection && !input.connection.targetConnection) {
        try { input.connection.connect(saved[name]); } catch (e) {}
      }
    }
    if (this.rendered && typeof this.render === 'function') this.render();
    if (Blockly.Events && Blockly.Events.setGroup) Blockly.Events.setGroup(prevGroup);
  };
}

enableArity(Blockly.Blocks['print_multi'], 1);
enableArity(Blockly.Blocks['func_call'], 0);
enableArity(Blockly.Blocks['func_call_stmt'], 0);
enableArity(Blockly.Blocks['method_call'], 0);
enableArity(Blockly.Blocks['tuple_create'], 0);
enableArity(Blockly.Blocks['set_create'], 0);
enableArity(Blockly.Blocks['dict_create'], 0);
```

Note: `enableArity` wraps the `updateShape_` on the block DEFINITION object. Because Blockly clones the definition's methods onto each instance at `init` time (the instance calls `this.updateShape_()`), wrapping the definition's method before any block of that type is created means every instance gets the wrapped version. These definitions are all created at module load, before any block is instantiated, so the ordering holds.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/arity_buttons.spec.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/parser.js tests/arity_buttons.spec.js
git commit -m "feat: MakeCode-style +/- arity buttons on dynamic value-input blocks"
```
(Append trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

### Task 2: Wire the built-in `lists_create_with`

**Files:**
- Modify: `src/utils/parser.js` — one guarded `enableArity` call for the built-in list block.
- Test: `tests/arity_buttons.spec.js` (append one test)

- [ ] **Step 1: Append the failing test**

Add inside the existing `test.describe('arity +/- buttons', ...)` block in `tests/arity_buttons.spec.js`:

```js
  test('built-in lists_create_with gets +/- buttons too', async ({ page }) => {
    await bootWorkspace(page);
    const id = await newBlock(page, 'lists_create_with', { itemCount: 2 });
    const r = await page.evaluate((id) => {
      const b = window.__blocklyWorkspace.getBlockById(id);
      const isWired = typeof b.changeArity_ === 'function';
      if (isWired) b.changeArity_(1);
      return { isWired, after: b.itemCount_, hasAdd2: !!b.getInput('ADD2'), hasPlus: !!b.getField('PLUS') };
    }, id);
    expect(r.isWired).toBe(true);
    expect(r.after).toBe(3);
    expect(r.hasAdd2).toBe(true);
    expect(r.hasPlus).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/arity_buttons.spec.js -g "built-in lists_create_with"`
Expected: FAIL — `isWired` is false (`changeArity_` not installed on the built-in block).

- [ ] **Step 3: Add the guarded wiring**

In `src/utils/parser.js`, directly after the 7 `enableArity(...)` calls added in Task 1, append:

```js
// Blockly's built-in list literal uses the same itemCount_/ADDn mutator scheme, so the
// same wrapper gives it +/- buttons. Guard in case the core block name ever changes.
if (Blockly.Blocks['lists_create_with']) {
  enableArity(Blockly.Blocks['lists_create_with'], 0);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/arity_buttons.spec.js -g "built-in lists_create_with"`
Expected: PASS — `isWired` true, itemCount 3, ADD2 present, PLUS field present.

If it FAILS because the built-in `updateShape_` is named differently or absent, report it (DONE_WITH_CONCERNS) — do not force-fit. The built-in `lists_create_with` in Blockly defines `updateShape_`; if a future Blockly version renames it the guard simply no-ops and only this one test needs relaxing.

- [ ] **Step 5: Commit**

```bash
git add src/utils/parser.js tests/arity_buttons.spec.js
git commit -m "feat: extend +/- arity buttons to the built-in lists_create_with block"
```
(Append trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

### Task 3: No-regression verification

**Files:** none (verification only)

- [ ] **Step 1: Run the round-trip + block suites**

Run: `npx playwright test tests/random_roundtrip.spec.js tests/realistic_roundtrip.spec.js tests/method_def.spec.js tests/examples_gallery_blocks.spec.js tests/arity_buttons.spec.js`
Expected: PASS — random 24, realistic 33, method_def 5, gallery 20, arity 7 = 89 passed. The arity wrapper only appends decorative FieldImage fields and a method; it does not change `itemCount_` defaults, generator output, or astToBlockly, so existing round-trips are unaffected.

- [ ] **Step 2: Confirm no new failures vs known baseline**

The known pre-existing failures (not caused by this work) are: `tests/test_new_blocks.spec.js` `list_comprehension`, `tests/verify_w2.spec.js` `nonlocal_statement`, `tests/verify_w4.spec.js` `set_attribute`, `tests/verify_w4.spec.js` `multiple_assign`. If you run those suites, those four (and only those) may fail. Any OTHER failure is a regression to investigate.

- [ ] **Step 3: Append results to the gray-block report (optional doc)**

This task is verification-only; no commit needed unless Step 1 reveals a fix. If all green, report DONE with the pass counts.

---

## Self-Review Notes

- **Spec coverage:** `enableArity`/`appendArityButtons` (Task 1) ✓, `changeArity_` connection preservation (Task 1 test "child connection preserved") ✓, all 7 custom blocks wired (Task 1) ✓, `lists_create_with` (Task 2) ✓, min guard + MINUS-hidden-at-min (Task 1 tests) ✓, print_multi min=1 (Task 1) ✓, serialization persists (Task 1) ✓, no-regression (Task 3) ✓, SVG icons concrete (real base64 in Task 1) ✓.
- **No placeholders:** SVG data-URIs are the actual base64 strings; all test/impl code complete.
- **Field-name consistency:** button field names `MINUS`/`PLUS`, count `itemCount_`, min `arityMin_`, method `changeArity_` — used identically across Tasks 1-2 and tests.
- **Risk note:** `enableArity` wraps the definition's `updateShape_`. All target definitions are created at module load before any instance; wrapping-before-instantiation is required and holds. Built-in `lists_create_with` wrapped via the same path with a name guard.
