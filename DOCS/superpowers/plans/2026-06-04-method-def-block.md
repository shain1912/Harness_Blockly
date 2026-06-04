# `method_def` Connectable Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert class methods / nested function defs from gray `raw_statement` lumps into real, connectable `method_def` blocks (gray-block count 18 → 0) with byte-identical text round-trips.

**Architecture:** Add one statement-connectable Blockly block (`method_def`) with prev/next connections, NAME/PARAMS/DECORATORS fields, and a BODY statement input. Route nested `FunctionDef` → `method_def` and nested `ClassDef` → the already-connectable `class_def` in the two suite-builder functions, replacing the `raw_statement` fallback. Params stay a flat text field (lossless: defaults, `*args`, annotations, decorators all survive as text).

**Tech Stack:** Plain JS (`src/utils/parser.js`, side-effect global `window.BlockPyParser`), Playwright e2e + Node `require()` tests.

---

## File Structure

- `src/utils/parser.js` — all changes:
  - Add `method_def` block definition + `Blockly.Python['method_def']` generator + `forBlock` alias (near `class_def`, ~line 4324).
  - Add `functionDefToMethodBlock(stmt)` helper.
  - Modify `convertClassBodyToBlock` (3267) and `convertStatementListToBlock` (3282) routing.
- `tests/method_def.spec.js` — new Node + browser regression spec.
- `tests/fixtures/random/` — (optional) add a class-with-methods fixture if not already covered.

Background: top-level defs stay `procedures_def*` (unchanged). `convertStatementToBlock` already returns `class_def` for `ClassDef` (case at parser.js:2985) and is connectable, so nested classes just route through it.

---

### Task 1: Add the `method_def` block definition + generator

**Files:**
- Modify: `src/utils/parser.js` (insert after the `class_def` generator block, around line 4351, before the `raw_statement` block at 4354)
- Test: `tests/method_def.spec.js` (create)

- [ ] **Step 1: Write the failing browser test**

Create `tests/method_def.spec.js`:

```js
// Regression for method_def: class methods / nested defs become real connectable
// blocks (not gray raw_statement), with byte-identical text round-trips.
const { test, expect } = require('@playwright/test');
const P = require('../src/utils/parser.js');

const APP_URL = 'http://localhost:3000';

// ---- Browser helpers (mirror tests/test_new_blocks.spec.js) ----
async function convertPythonToBlocks(page, code) {
  await page.goto(APP_URL);
  await page.locator('#tab-btn-python').click();
  await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
  await page.locator('#python-code').fill('');
  await page.locator('#python-code').fill(code);
  await page.waitForTimeout(150);
  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(600);
  return await page.evaluate(() => window.__blocklyWorkspace.getAllBlocks(false).map(b => b.type));
}
async function generatedPython(page) {
  return await page.evaluate(() => window.Blockly.Python.workspaceToCode(window.__blocklyWorkspace));
}

test.describe('method_def block definition', () => {
  test('block + generator are registered and emit a def from a serialized workspace', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => !!window.Blockly && !!window.__blocklyWorkspace, null, { timeout: 15000 });
    const out = await page.evaluate(() => {
      const defined = !!window.Blockly.Blocks['method_def'] && !!window.Blockly.Python['method_def'];
      const json = { blocks: { languageVersion: 0, blocks: [{
        type: 'method_def',
        fields: { DECORATORS: '', NAME: '__init__', PARAMS: 'self, name' },
        inputs: { BODY: { block: { type: 'raw_statement', fields: { STMT: 'self.name = name' } } } }
      }]}};
      window.Blockly.serialization.workspaces.load(json, window.__blocklyWorkspace);
      const code = window.Blockly.Python.workspaceToCode(window.__blocklyWorkspace);
      return { defined, code: code.trim() };
    });
    expect(out.defined).toBe(true);
    expect(out.code).toBe('def __init__(self, name):\n    self.name = name');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/method_def.spec.js -g "block definition"`
Expected: FAIL — `out.defined` is `false` (block/generator not registered yet).

- [ ] **Step 3: Implement the block definition + generator**

In `src/utils/parser.js`, immediately after the `class_def` `forBlock` alias (line ~4351, before `// Raw Python statement block`), insert:

```js
// Connectable function/method definition block. Unlike procedures_def* (Blockly "hat"
// blocks with no prev/next), this has statement connections so it can nest inside a
// class_def BODY or another def's body. Params are a flat text field (lossless: defaults,
// *args/**kwargs, type annotations all survive as text). Decorators emit as @-lines above.
Blockly.Blocks['method_def'] = {
  init: function() {
    const DecoField = Blockly.FieldMultilineInput || Blockly.FieldTextInput;
    this.appendDummyInput('DECO')
        .appendField(new DecoField(''), 'DECORATORS');
    this.appendDummyInput()
        .appendField("def")
        .appendField(new Blockly.FieldTextInput("method"), "NAME")
        .appendField("(")
        .appendField(new Blockly.FieldTextInput("self"), "PARAMS")
        .appendField("):");
    this.appendStatementInput("BODY").setCheck(null).appendField("do");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour("#8b5cf6");
    this.setTooltip("Defines a function/method (nestable)");
  }
};
Blockly.Python['method_def'] = function(block) {
  const deco = (block.getFieldValue('DECORATORS') || '').trim();
  const decoLines = deco ? deco.split('\n').map(d => d.trim()).join('\n') + '\n' : '';
  const name = block.getFieldValue('NAME');
  const params = block.getFieldValue('PARAMS') || '';
  const body = Blockly.Python.statementToCode(block, 'BODY') || '    pass\n';
  return `${decoLines}def ${name}(${params}):\n${body}`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['method_def'] = Blockly.Python['method_def'];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/method_def.spec.js -g "block definition"`
Expected: PASS — `defined` true, code equals `def __init__(self, name):\n    self.name = name`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/parser.js tests/method_def.spec.js
git commit -m "feat: method_def connectable block definition + Python generator"
```

---

### Task 2: Route nested defs/classes through real blocks

**Files:**
- Modify: `src/utils/parser.js` — add `functionDefToMethodBlock` helper; change `convertClassBodyToBlock` (3267-3280) and `convertStatementListToBlock` (3282-3315)
- Test: `tests/method_def.spec.js` (extend)

- [ ] **Step 1: Write the failing Node test**

Append to `tests/method_def.spec.js`:

```js
test.describe('method_def routing (Node, astToBlockly JSON shape)', () => {
  const toBlocks = (code) => {
    const ast = new P.Parser(new P.Tokenizer(code).tokenize()).parse();
    return P.astToBlockly(ast);
  };
  // Walk every block in the serialized tree (next + nested inputs).
  const collect = (json) => {
    const out = [];
    const visit = (b) => {
      if (!b) return;
      out.push(b);
      if (b.inputs) for (const k of Object.keys(b.inputs)) {
        if (b.inputs[k] && b.inputs[k].block) visit(b.inputs[k].block);
      }
      if (b.next && b.next.block) visit(b.next.block);
    };
    (json.blocks.blocks || []).forEach(visit);
    return out;
  };

  test('class methods become method_def, not raw_statement', () => {
    const code = [
      'class Dog:',
      '    def __init__(self, name):',
      '        self.name = name',
      '    def bark(self):',
      '        return self.name + " says woof"',
      ''
    ].join('\n');
    const all = collect(toBlocks(code));
    const methods = all.filter(b => b.type === 'method_def');
    expect(methods.length).toBe(2);
    expect(methods.map(m => m.fields.NAME).sort()).toEqual(['__init__', 'bark']);
    expect(methods.find(m => m.fields.NAME === '__init__').fields.PARAMS).toBe('self, name');
    // No method should have leaked into a raw_statement.
    const rawDefs = all.filter(b => b.type === 'raw_statement' && /^\s*def /.test(b.fields.STMT || ''));
    expect(rawDefs.length).toBe(0);
  });

  test('nested function def becomes method_def', () => {
    const code = ['def outer():', '    def inner(x):', '        return x + 1', '    return inner(1)', ''].join('\n');
    const all = collect(toBlocks(code));
    expect(all.some(b => b.type === 'method_def' && b.fields.NAME === 'inner')).toBe(true);
  });

  test('decorated method preserves DECORATORS', () => {
    const code = ['class C:', '    @staticmethod', '    def f(x):', '        return x', ''].join('\n');
    const all = collect(toBlocks(code));
    const f = all.find(b => b.type === 'method_def' && b.fields.NAME === 'f');
    expect(f).toBeTruthy();
    expect(f.fields.DECORATORS).toBe('@staticmethod');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/method_def.spec.js -g "routing"`
Expected: FAIL — methods currently emit as `raw_statement` (methods.length === 0).

- [ ] **Step 3: Add the helper**

In `src/utils/parser.js`, immediately above `function convertClassBodyToBlock(stmts) {` (line 3267), insert:

```js
// Build a connectable method_def block from a FunctionDef AST node. Used for class methods
// and nested function defs (which can't use the non-connectable procedures_def* hat blocks).
function functionDefToMethodBlock(stmt) {
  const block = {
    "type": "method_def",
    "id": makeBlockId(),
    "fields": {
      "NAME": stmt.name,
      "PARAMS": (stmt.params || []).join(', ')
    },
    "inputs": {}
  };
  if (stmt.decorators && stmt.decorators.length) {
    block.fields.DECORATORS = stmt.decorators.map(d => '@' + astToPython(d)).join('\n');
  }
  const bodyBlock = convertStatementListToBlock(stmt.body);
  if (bodyBlock) block.inputs.BODY = { "block": bodyBlock };
  return block;
}
```

- [ ] **Step 4: Update `convertClassBodyToBlock`**

Replace the loop body in `convertClassBodyToBlock` (lines 3270-3274) — change:

```js
    // Methods become raw_statement blocks so they can nest inside class_def BODY input
    const block = stmt.type === 'FunctionDef'
      ? { "type": "raw_statement", "id": makeBlockId(), "fields": { "STMT": astToPython(stmt, 0) } }
      : convertStatementToBlock(stmt);
```

to:

```js
    // Methods become connectable method_def blocks; nested classes use class_def (both
    // have prev/next connections so they stack inside the class BODY input).
    const block = stmt.type === 'FunctionDef'
      ? functionDefToMethodBlock(stmt)
      : convertStatementToBlock(stmt);
```

- [ ] **Step 5: Update `convertStatementListToBlock`**

Replace the FunctionDef/ClassDef branch in `convertStatementListToBlock` (lines 3288-3302) — change:

```js
    // [Demo] Blockly's procedures_def*/class blocks are top-level "hat" blocks with no
    // previous/next connection, so a nested function/class def inside a suite cannot be
    // chained here (causes MissingConnection on load). Emit it as a lossless raw_statement
    // carrying the full source so the round-trip stays exact.
    let block;
    if (stmt.type === 'FunctionDef' || stmt.type === 'ClassDef') {
      block = {
        "type": "raw_statement",
        "id": makeBlockId(),
        "fields": { "STMT": astToPython(stmt) }
      };
    } else {
      block = convertStatementToBlock(stmt);
    }
```

to:

```js
    // Nested function defs use the connectable method_def block; nested classes use the
    // connectable class_def block (via convertStatementToBlock). Both have prev/next
    // connections so they chain into this suite without MissingConnection on load.
    let block;
    if (stmt.type === 'FunctionDef') {
      block = functionDefToMethodBlock(stmt);
    } else {
      block = convertStatementToBlock(stmt);
    }
```

(ClassDef now falls through to `convertStatementToBlock`, which returns a `class_def` block — connectable.)

- [ ] **Step 6: Run the Node routing tests to verify they pass**

Run: `npx playwright test tests/method_def.spec.js -g "routing"`
Expected: PASS — all three routing tests green.

- [ ] **Step 7: Commit**

```bash
git add src/utils/parser.js tests/method_def.spec.js
git commit -m "feat: route nested defs->method_def and nested classes->class_def (no more gray method lumps)"
```

---

### Task 3: Browser round-trip + gray-count regression

**Files:**
- Test: `tests/method_def.spec.js` (extend with a browser round-trip + gray-count assertion)

- [ ] **Step 1: Write the failing browser round-trip test**

Append to `tests/method_def.spec.js`:

```js
test.describe('method_def full round-trip (browser)', () => {
  const norm = (s) => s.replace(/\s+/g, '').trim();

  test('Dog class round-trips with method_def blocks and zero gray method lumps', async ({ page }) => {
    test.setTimeout(45000);
    const code = [
      'class Dog:',
      '    def __init__(self, name):',
      '        self.name = name',
      '    def bark(self):',
      '        return self.name + " says woof"',
      ''
    ].join('\n');
    const types = await convertPythonToBlocks(page, code);
    expect(types).toContain('method_def');
    expect(types).toContain('class_def');
    // No method leaked as a raw_statement.
    const rawCount = await page.evaluate(() =>
      window.__blocklyWorkspace.getAllBlocks(false).filter(b => b.type === 'raw_statement').length);
    expect(rawCount).toBe(0);
    // Block -> Python regenerates the original (whitespace-insensitive).
    const out = await generatedPython(page);
    expect(norm(out)).toBe(norm(code));
  });
});
```

- [ ] **Step 2: Run to verify it passes (implementation already landed in Tasks 1-2)**

Run: `npx playwright test tests/method_def.spec.js -g "full round-trip"`
Expected: PASS — `method_def` + `class_def` present, `rawCount` 0, regenerated Python matches.

(If it FAILS on a load error, the most likely cause is a field-name mismatch between the block definition's field keys (`DECORATORS`/`NAME`/`PARAMS`/`BODY`) and the JSON emitted by `functionDefToMethodBlock` — verify they match exactly, per CLAUDE.md's field-name parity rule.)

- [ ] **Step 3: Run the full suite to confirm no regression**

Run: `npx playwright test tests/random_roundtrip.spec.js tests/realistic_roundtrip.spec.js tests/examples_gallery_blocks.spec.js tests/method_def.spec.js`
Expected: PASS — all previously-green specs still pass; text round-trips are byte-identical because `method_def`'s generator reproduces the same `def ...` text the old `raw_statement` carried.

- [ ] **Step 4: Commit**

```bash
git add tests/method_def.spec.js
git commit -m "test: method_def browser round-trip + zero-gray-method regression"
```

---

### Task 4: Update the gray-block audit report

**Files:**
- Modify: `DOCS/superpowers/2026-06-04-random-test-report.md` (append a follow-up section)

- [ ] **Step 1: Append the results section**

Add to the end of `DOCS/superpowers/2026-06-04-random-test-report.md`:

```markdown

---

## 회색 블록 캠페인 — 라운드 1: 클래스/메서드 정의 (2026-06-04)

중첩 def / 클래스 메서드 18개를 `raw_statement`(회색)에서 연결형 `method_def` 블록으로 전환.

- **근본 원인**: `procedures_def*`는 hat 블록(prev/next 없음) → class_def BODY/함수 본문에
  중첩 불가 → 통짜 raw로 덤프되던 것.
- **조치**: 연결형 `method_def` 블록 신설(NAME/PARAMS/DECORATORS 필드 + BODY 스택 입력).
  `convertClassBodyToBlock` / `convertStatementListToBlock`이 중첩 FunctionDef →
  `method_def`, 중첩 ClassDef → `class_def`로 라우팅(임의 깊이 중첩 지원).
- **무손실**: PARAMS는 평평한 텍스트(기본값·`*args`·타입주석 보존), 데코레이터는
  DECORATORS 필드로 보존. 텍스트 라운드트립 바이트 동일.
- **결과**: 회색(메서드/중첩 def) 18 → 0. 신규 회귀: `tests/method_def.spec.js`.
- **남은 회색**: docstring 22, lambda 4, 표현식 range 1 (후속 라운드).
```

- [ ] **Step 2: Commit**

```bash
git add DOCS/superpowers/2026-06-04-random-test-report.md
git commit -m "docs: gray-block campaign round 1 (class/method def) results"
```

---

## Self-Review Notes

- **Spec coverage:** block def (Task 1) ✓, generator (Task 1) ✓, helper + both routing sites (Task 2) ✓, decorators/params losslessness (Task 2 test) ✓, round-trip + gray-count (Task 3) ✓, report (Task 4) ✓, edge cases (empty body→`pass` in generator; nested-in-method via `convertStatementListToBlock` recursion; top-level def unchanged) ✓.
- **Field-name parity:** JSON keys `NAME`/`PARAMS`/`DECORATORS`/`BODY` in `functionDefToMethodBlock` match the field/input names in `Blockly.Blocks['method_def']` exactly (CLAUDE.md round-trip rule).
- **Helper name consistency:** `functionDefToMethodBlock` used identically in Task 2 Steps 3-5.
- **No placeholders:** all code complete; commands exact.
- **`async def` / lambda:** out of scope (documented in spec); parser leaves them as-is.
