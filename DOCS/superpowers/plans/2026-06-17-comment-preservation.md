# Comment Preservation (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Python comments (leading, inline-trailing, and dangling) losslessly across the Python ↔ blocks round-trip, shown and editable as Blockly native comment bubbles.

**Architecture:** Comments are extracted with stdlib `tokenize` (no parso), associated to IR statement nodes by line number, and carried on each `ast.stmt` IR node as an optional `_comments {leading[], trailing, after[]}` field. `irToBlockly` mirrors that to the block's native comment bubble (display/edit) plus `block.data` (structured source of truth); `blocklyToIr` restores it from `block.data`; `irToPython` re-injects via an `ast._Unparser` subclass. Format is regenerated (Option 3) — comments preserved, blank lines/style not.

**Tech Stack:** Pyodide CPython 3.12.1 (`ast`, `tokenize`), Blockly (CDN), Playwright e2e. No new dependencies.

## Global Constraints

- **No new dependencies.** Comment extraction uses stdlib `tokenize` only (parso is NOT used).
- **Target runtime is Pyodide CPython 3.12** — `ast._Unparser` and `ast` internals are pinned-version APIs (already relied on by the project). Verified present: `ast._Unparser` exists in 3.12.1.
- **TDD:** every task writes the failing test first, runs it red, implements minimally, runs it green.
- **Review gate:** after each task, run the Codex adversarial review via the **Bash tool** (NOT PowerShell — the prompt is UTF-8 Korean and PowerShell 5.1 mangles it): `codex exec review "$(cat scripts/codex-review-prompt.md)"`. Gate on **Codex blocking 0** before committing.
- **Browser tests run with `PORT=3100`** (port 3000 is occupied by another project): `$env:PORT="3100"; npx playwright test <spec>`.
- **Commit trailer (verbatim):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **`package-lock.json` must stay OUT of every commit** (it is pre-existing modified; never stage it).
- **Backward compatibility:** IR nodes without `_comments` behave exactly as before; the field is optional everywhere it is read.
- **Non-mutation invariant (from ir_toolbox):** `blocklyToIr` deep-clones its input snapshot at entry; do not reintroduce in-place mutation of the caller's snapshot.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/utils/pyAstBridge.js` | Python↔IR bridge (Pyodide). `PY_AST_TO_JSON` (`_parse`), `PY_IR_TO_CODE` (`_unparse`). | Modify: add comment extraction+association to `_parse`; add `_CommentUnparser` re-injection to `_unparse`. |
| `src/utils/irToBlockly.js` | IR → Blockly JSON. `stmtToBlock` dispatch (line 532). | Modify: in `stmtToBlock`, attach `_comments` → `block.data` + `block.icons.comment`. Export `renderComments`. |
| `src/utils/blocklyToIr.js` | Blockly JSON → IR. `blockToStmt` dispatch. | Modify: in `blockToStmt`, restore `_comments` from `b.data` (with bubble-edit detection). |
| `tests/ir_comments.spec.js` | All Phase 3 tests (node + browser). | Create. |

**Serialization shapes (verified in live Blockly):** a block's `data` saves as top-level `"data": "<string>"`; its comment saves as `"icons": { "comment": { "text", "pinned": false, "height": 80, "width": 160 } }`.

**Test invocation patterns:**
- Browser (needs Pyodide): `const py = await window.BlockPyAstBridge.getPyodide();` then `pythonToIR(py, code)` / `irToPython(py, ir)`. Wait-for: `window.__pyodide && window.BlockPyAstBridge && window.BlockPyIR`.
- Node (pure JS, no Pyodide): `require('../src/utils/irToBlockly.js'); require('../src/utils/blocklyToIr.js'); const IR = global.BlockPyIR;`

---

## Task 1: Comment extraction + association (Python → IR)

Attach `_comments` to statement IR nodes during `pythonToIR`.

**Files:**
- Modify: `src/utils/pyAstBridge.js` (the `PY_AST_TO_JSON` template — `_to_ir` and `_parse`)
- Test: `tests/ir_comments.spec.js`

**Interfaces:**
- Produces: `pythonToIR(py, code)` now returns IR where an `ast.stmt` node may carry
  `_comments: { leading?: string[], trailing?: string, after?: string[] }`. Comment strings
  include the leading `#` (raw token text). Nodes without comments have no `_comments` key.

- [ ] **Step 1: Write the failing test** — append to `tests/ir_comments.spec.js`:

```js
const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:' + (process.env.PORT || '3000') + '/';

test.describe('comment extraction (browser)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(220000);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__pyodide && window.BlockPyAstBridge && window.BlockPyIR,
      null, { timeout: 180000 });
  });

  test('pythonToIR attaches leading/trailing/after comments to stmt nodes', async ({ page }) => {
    const ir = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = [
        '# header',
        'import os  # std',
        'def f():',
        '    # body',
        '    x = 1  # one',
        '    # tail',
        'y = 2',
      ].join('\n');
      return window.BlockPyAstBridge.pythonToIR(py, src);
    });
    const imp = ir.body[0];                 // Import
    const fn = ir.body[1];                   // FunctionDef
    const y = ir.body[2];                    // Assign y = 2
    expect(imp._comments.leading).toEqual(['# header']);
    expect(imp._comments.trailing).toBe('# std');
    const xStmt = fn.body[0];                // x = 1
    expect(xStmt._comments.leading).toEqual(['# body']);
    expect(xStmt._comments.trailing).toBe('# one');
    expect(xStmt._comments.after).toEqual(['# tail']);   // dangling at end of body
    expect(y._comments).toBeUndefined();     // no comment on y
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:PORT="3100"; npx playwright test tests/ir_comments.spec.js -g "attaches leading" --reporter=line`
Expected: FAIL — `imp._comments` is undefined (extraction not implemented).

- [ ] **Step 3: Implement extraction + association** — in `src/utils/pyAstBridge.js`, edit the `PY_AST_TO_JSON` template. Add `tokenize, io` to its imports and insert the helpers, then make `_to_ir` emit `_comments` and `_parse` attach them:

```python
# add to the import line at the top of PY_AST_TO_JSON:
import ast, json, base64, tokenize, io

# ... existing _enc_* and _key helpers unchanged ...

def _collect_comments(src):
    out = []
    lines = src.splitlines()
    try:
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if tok.type == tokenize.COMMENT:
                srow, scol = tok.start
                line = lines[srow - 1] if 0 <= srow - 1 < len(lines) else ''
                out.append({'line': srow, 'col': scol, 'text': tok.string,
                            'standalone': line[:scol].strip() == ''})
    except (tokenize.TokenError, IndentationError):
        pass  # ast.parse already succeeded; tokenize is best-effort on the same source
    return out

def _set_cmt(node, key, val, append):
    cm = getattr(node, '_cmt', None)
    if cm is None:
        cm = {}
        node._cmt = cm
    if append:
        cm.setdefault(key, []).append(val)
    else:
        cm[key] = val

def _attach_comments(tree, src):
    comments = _collect_comments(src)
    if not comments:
        return
    stmts = [n for n in ast.walk(tree) if isinstance(n, ast.stmt) and hasattr(n, 'lineno')]
    for c in comments:
        if not c['standalone']:
            same = [s for s in stmts if s.lineno == c['line']]
            if same:
                _set_cmt(max(same, key=lambda s: s.col_offset), 'trailing', c['text'], False)
            continue
        after = [s for s in stmts if s.lineno > c['line']]
        if after:
            _set_cmt(min(after, key=lambda s: s.lineno), 'leading', c['text'], True)
        else:
            before = [s for s in stmts if s.lineno < c['line']]
            if before:
                _set_cmt(max(before, key=lambda s: s.lineno), 'after', c['text'], True)

# in _to_ir, AFTER the existing `if hasattr(node, "lineno"): d["_loc"] = ...` block, add:
        if isinstance(node, ast.AST) and getattr(node, '_cmt', None):
            d["_comments"] = node._cmt

# replace _parse:
def _parse(src):
    tree = ast.parse(src)
    _attach_comments(tree, src)
    return json.dumps(_to_ir(tree))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:PORT="3100"; npx playwright test tests/ir_comments.spec.js -g "attaches leading" --reporter=line`
Expected: PASS.

- [ ] **Step 5: Regression — run the full IR suite**

Run: `$env:PORT="3100"; npx playwright test tests/ir_roundtrip.spec.js tests/ir_unit.spec.js --reporter=line`
Expected: all PASS (nodes without comments are unchanged; `_comments` only added when present).

- [ ] **Step 6: Codex review (gate on blocking 0)**

Run (Bash tool): `codex exec review "$(cat scripts/codex-review-prompt.md)"`
Address any BLOCKING finding (re-run until blocking 0). NITs may be deferred.

- [ ] **Step 7: Commit**

```bash
git reset -q HEAD package-lock.json
git add src/utils/pyAstBridge.js tests/ir_comments.spec.js
git commit -F - <<'EOF'
feat(ir): comment extraction + association (Phase 3 slice 1a)

tokenize-based comment scan (no parso) attaches _comments {leading,trailing,
after} to ast.stmt IR nodes during pythonToIR. Backward compatible: nodes
without comments carry no _comments key.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Comment re-injection (IR → Python)

`irToPython` emits the carried comments via an `ast._Unparser` subclass.

**Files:**
- Modify: `src/utils/pyAstBridge.js` (the `PY_IR_TO_CODE` template — `_from_ir`, `_unparse`)
- Test: `tests/ir_comments.spec.js`

**Interfaces:**
- Consumes: IR with `_comments` on stmt nodes (Task 1).
- Produces: `irToPython(py, ir)` emits `# leading` lines before a statement (correct indent),
  ` # trailing` appended on the statement's line, and `# after` lines following it.

- [ ] **Step 1: Write the failing test** — append to `tests/ir_comments.spec.js` inside the browser describe:

```js
  test('irToPython re-injects comments; python->IR->python round-trips them', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = [
        '# header',
        'import os  # std',
        '',
        'def f():',
        '    # body',
        '    x = 1  # one',
        '    return x',
        'y = 2  # last',
      ].join('\n');
      const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
      const code = await window.BlockPyAstBridge.irToPython(py, ir);
      return code;
    });
    // Option 3: blank lines may vanish, but every comment must survive at its position.
    expect(out).toContain('# header');
    expect(out).toContain('import os  # std');
    expect(out).toContain('    # body');           // indented inside the function body
    expect(out).toContain('    x = 1  # one');
    expect(out).toContain('y = 2  # last');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:PORT="3100"; npx playwright test tests/ir_comments.spec.js -g "re-injects" --reporter=line`
Expected: FAIL — `ast.unparse` drops comments, so `# header` etc. are absent.

- [ ] **Step 3: Implement re-injection** — in `src/utils/pyAstBridge.js`, edit the `PY_IR_TO_CODE` template: stash `_comments` on rebuilt nodes and unparse with a subclass:

```python
# in _from_ir, when rebuilding an AST node, stash comments BEFORE returning.
# Replace the AST-node branch body with:
def _from_ir(d):
    if isinstance(d, dict) and "type" in d:
        cls = getattr(ast, d["type"])
        kwargs = {f: _from_ir(d.get(_key(f))) for f in cls._fields}
        node = ast.fix_missing_locations(cls(**kwargs))
        if d.get("_comments"):
            node._cmt = d["_comments"]
        return node
    if isinstance(d, dict) and "__py__" in d:
        return _dec_prim(d)
    if isinstance(d, list):
        return [_from_ir(x) for x in d]
    return d

class _CommentUnparser(ast._Unparser):
    def traverse(self, node):
        cm = getattr(node, '_cmt', None)
        if isinstance(node, ast.stmt) and cm:
            for lead in cm.get('leading', []):
                self.fill(lead)
        super().traverse(node)
        if isinstance(node, ast.stmt) and cm:
            if cm.get('trailing'):
                self.write('  ' + cm['trailing'])
            for aft in cm.get('after', []):
                self.fill(aft)

def _unparse(js):
    return _CommentUnparser().visit(_from_ir(json.loads(js)))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:PORT="3100"; npx playwright test tests/ir_comments.spec.js -g "re-injects" --reporter=line`
Expected: PASS.

- [ ] **Step 5: Regression**

Run: `$env:PORT="3100"; npx playwright test tests/ir_roundtrip.spec.js tests/ir_unit.spec.js --reporter=line`
Expected: all PASS (comment-free IR unparses identically; `_CommentUnparser` with no `_cmt` behaves as base `_Unparser`).

- [ ] **Step 6: Codex review (gate on blocking 0)** — Bash tool: `codex exec review "$(cat scripts/codex-review-prompt.md)"`

- [ ] **Step 7: Commit**

```bash
git reset -q HEAD package-lock.json
git add src/utils/pyAstBridge.js tests/ir_comments.spec.js
git commit -F - <<'EOF'
feat(ir): comment re-injection via _CommentUnparser (Phase 3 slice 1b)

irToPython unparses with an ast._Unparser subclass that emits leading lines
(fill, correct indent), trailing inline (write '  # ...'), and after lines.
Text round-trip python->IR->python now preserves comments (Option 3: format
regenerated, comments kept).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: irToBlockly attaches comments to blocks

Mirror `_comments` to the block's native comment bubble + `block.data`.

> **Verified (no collision):** a grep of `irBlocks.js` / `irToBlockly.js` / `blocklyToIr.js`
> found no existing use of `block.data` on `ir_*` blocks, so `data` is free for comment storage.

**Files:**
- Modify: `src/utils/irToBlockly.js` (`stmtToBlock` at line 532; export `renderComments`)
- Test: `tests/ir_comments.spec.js` (node-level)

**Interfaces:**
- Consumes: IR stmt node with optional `_comments` (Task 1).
- Produces: `irToBlockly(ir)` block JSON where a commented statement carries
  `data: JSON.stringify(_comments)` and `icons.comment.{text,pinned:false,height:80,width:160}`
  with `text === renderComments(_comments)`.
- Produces (exported): `BlockPyIR.renderComments(c) -> string` — bubble text = leading lines,
  then trailing (if any), then after lines, joined by `\n`.

- [ ] **Step 1: Write the failing test** — append a NODE describe to `tests/ir_comments.spec.js`:

```js
require('../src/utils/irToBlockly.js');
require('../src/utils/blocklyToIr.js');
const IR = global.BlockPyIR;

test.describe('comment block mapping (node)', () => {
  test('irToBlockly writes data + comment bubble for a commented stmt', () => {
    const ir = { type: 'Module', type_ignores: [], body: [
      { type: 'Assign',
        targets: [{ type: 'Name', id: 'x' }],
        value: { type: 'Constant', value: 1 },
        _comments: { leading: ['# header'], trailing: '# one', after: [] } },
    ] };
    const ws = IR.irToBlockly(ir);
    const b = ws.blocks.blocks[0];
    expect(JSON.parse(b.data)).toEqual({ leading: ['# header'], trailing: '# one', after: [] });
    expect(b.icons.comment.text).toBe('# header\n# one');
    expect(b.icons.comment.pinned).toBe(false);
  });

  test('irToBlockly leaves uncommented stmts untouched (no data, no icons)', () => {
    const ir = { type: 'Module', type_ignores: [], body: [
      { type: 'Assign', targets: [{ type: 'Name', id: 'x' }], value: { type: 'Constant', value: 1 } },
    ] };
    const b = IR.irToBlockly(ir).blocks.blocks[0];
    expect(b.data).toBeUndefined();
    expect(b.icons).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/ir_comments.spec.js -g "writes data" --reporter=line`
Expected: FAIL — `b.data` undefined (mapping not implemented).

- [ ] **Step 3: Implement** — in `src/utils/irToBlockly.js`, add `renderComments`, attach in `stmtToBlock`, and export. Replace `stmtToBlock` (lines 532-536):

```js
// Bubble text rendering: leading lines, then trailing, then after — human-readable, and the
// exact string blocklyToIr compares against to detect a user edit (Task 4/5).
function renderComments(c) {
  if (!c) return '';
  const parts = [...(c.leading || [])];
  if (c.trailing) parts.push(c.trailing);
  parts.push(...(c.after || []));
  return parts.join('\n');
}

function stmtToBlock(n) {
  const h = STMT_HANDLERS[n.type];
  if (!h) noHandler('stmt', n.type);
  const block = h(n);
  if (n._comments && (
        (n._comments.leading && n._comments.leading.length) ||
        n._comments.trailing ||
        (n._comments.after && n._comments.after.length))) {
    block.data = JSON.stringify(n._comments);
    block.icons = { comment: { text: renderComments(n._comments), pinned: false, height: 80, width: 160 } };
  }
  return block;
}
```

Then add `renderComments` to the exports at the bottom (the `Object.assign(api.BlockPyIR, {...})` call):

```js
api.BlockPyIR = Object.assign(api.BlockPyIR || {},
  { irToBlockly, exprToBlock, NODE_POLICY, OPTIONAL_DEPRECATED, __handled, renderComments });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/ir_comments.spec.js -g "writes data|untouched" --reporter=line`
Expected: PASS (both).

- [ ] **Step 5: Regression**

Run: `$env:PORT="3100"; npx playwright test tests/ir_unit.spec.js tests/ir_roundtrip.spec.js --reporter=line`
Expected: all PASS.

- [ ] **Step 6: Codex review (gate on blocking 0)** — Bash tool.

- [ ] **Step 7: Commit**

```bash
git reset -q HEAD package-lock.json
git add src/utils/irToBlockly.js tests/ir_comments.spec.js
git commit -F - <<'EOF'
feat(ir): irToBlockly mirrors comments to bubble + block.data (Phase 3 slice 2a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: blocklyToIr restores comments from block.data

**Files:**
- Modify: `src/utils/blocklyToIr.js` (`blockToStmt`)
- Test: `tests/ir_comments.spec.js` (node round-trip)

**Interfaces:**
- Consumes: block JSON with `data` (JSON `_comments`) and optionally `icons.comment.text` (Task 3).
- Produces: `blocklyToIr(ws)` attaches `_comments` to the stmt IR node. If the bubble text differs
  from `renderComments(parsed data)`, treat as a user edit: `_comments = { leading: <bubble lines>,
  trailing: null, after: [] }` (Task 5 formalizes this; Task 4 only restores the unedited case).

- [ ] **Step 1: Write the failing test** — append to the node describe:

```js
  test('blocklyToIr restores _comments from block.data (full IR round-trip)', () => {
    const original = { type: 'Module', type_ignores: [], body: [
      { type: 'Assign', targets: [{ type: 'Name', id: 'x' }], value: { type: 'Constant', value: 1 },
        _comments: { leading: ['# header'], trailing: '# one', after: [] } },
    ] };
    const ws = IR.irToBlockly(original);
    const back = IR.blocklyToIr(ws);
    expect(back.body[0]._comments).toEqual({ leading: ['# header'], trailing: '# one', after: [] });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/ir_comments.spec.js -g "restores _comments" --reporter=line`
Expected: FAIL — `back.body[0]._comments` undefined.

- [ ] **Step 3: Implement** — in `src/utils/blocklyToIr.js`, locate `blockToStmt(b)` (it calls `normInputs(b)` then `BLOCK_TO_STMT[b.type]`). Capture the result and attach `_comments`. Replace the body of `blockToStmt`:

```js
function blockToStmt(b) {
  normInputs(b);
  const h = BLOCK_TO_STMT[b.type];
  if (!h) throw new Error('blocklyToIr: no stmt handler for ' + b.type);
  const stmt = h(b);
  const cm = readBlockComments(b);
  if (cm) stmt._comments = cm;
  return stmt;
}

// Restore structured comments from the block's serialized `data`. If the live bubble text was
// edited away from the stored rendering, adopt the edited text as leading (Option 3 simplification).
function readBlockComments(b) {
  let stored = null;
  if (typeof b.data === 'string' && b.data) {
    try { stored = JSON.parse(b.data); } catch (_) { stored = null; }
  }
  const bubble = b.icons && b.icons.comment ? b.icons.comment.text : undefined;
  // Reuse irToBlockly's renderComments (exported on BlockPyIR). irToBlockly loads before
  // blocklyToIr in both main.jsx and the test requires, and readBlockComments runs only at
  // conversion time (post-load), so BlockPyIR.renderComments is defined by call time. No duplication.
  const render = (typeof window !== 'undefined' ? window : global).BlockPyIR.renderComments;
  if (typeof bubble === 'string' && stored && bubble !== render(stored)) {
    // user edited the bubble -> simplify to leading lines
    const leading = bubble.split('\n').filter((l) => l.trim() !== '');
    return leading.length ? { leading, trailing: null, after: [] } : null;
  }
  if (typeof bubble === 'string' && !stored && bubble.trim() !== '') {
    // bubble present with no stored data (user added a comment to a fresh block)
    return { leading: bubble.split('\n').filter((l) => l.trim() !== ''), trailing: null, after: [] };
  }
  return stored;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/ir_comments.spec.js -g "restores _comments" --reporter=line`
Expected: PASS.

- [ ] **Step 5: Full python→blocks→python browser round-trip** — append to the browser describe:

```js
  test('full python -> blocks -> python preserves comments', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = ['# header', 'x = 1  # one', 'def f():', '    return x  # r'].join('\n');
      const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
      const ws = window.BlockPyIR.irToBlockly(ir);
      const back = window.BlockPyIR.blocklyToIr(ws);
      return window.BlockPyAstBridge.irToPython(py, back);
    });
    expect(out).toContain('# header');
    expect(out).toContain('x = 1  # one');
    expect(out).toContain('    return x  # r');
  });
```

Run: `$env:PORT="3100"; npx playwright test tests/ir_comments.spec.js --reporter=line`
Expected: all PASS.

- [ ] **Step 6: Regression** — `$env:PORT="3100"; npx playwright test tests/ir_unit.spec.js tests/ir_roundtrip.spec.js tests/ir_toolbox.spec.js --reporter=line` → all PASS.

- [ ] **Step 7: Codex review (gate on blocking 0)** — Bash tool.

- [ ] **Step 8: Commit**

```bash
git reset -q HEAD package-lock.json
git add src/utils/blocklyToIr.js tests/ir_comments.spec.js
git commit -F - <<'EOF'
feat(ir): blocklyToIr restores comments from block.data (Phase 3 slice 2b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Edit-sync test (bubble edit → leading)

Task 4 already implements the edit-detection branch; Task 5 locks it with a dedicated test and the live-UI edit path.

**Files:**
- Test: `tests/ir_comments.spec.js`
- Modify (only if test reveals a gap): `src/utils/blocklyToIr.js`

**Interfaces:**
- Consumes: `readBlockComments` (Task 4).

- [ ] **Step 1: Write the failing/locking test (node)** — append to the node describe:

```js
  test('editing the bubble away from stored data is adopted as leading', () => {
    // Simulate a saved workspace where the user changed the comment bubble text.
    const ws = { blocks: { blocks: [
      { type: 'ir_assign', extraState: { n: 1 },
        data: JSON.stringify({ leading: ['# old'], trailing: '# inline', after: [] }),
        icons: { comment: { text: '# edited note', pinned: false, height: 80, width: 160 } },
        inputs: {
          TARGET0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
          VALUE: { shadow: { type: 'ir_const', fields: { VALUE: '0' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0]._comments).toEqual({ leading: ['# edited note'], trailing: null, after: [] });
  });

  test('unedited bubble keeps the stored structured comments verbatim', () => {
    const stored = { leading: ['# keep'], trailing: '# t', after: [] };
    const bubble = ['# keep', '# t'].join('\n');   // == renderComments(stored)
    const ws = { blocks: { blocks: [
      { type: 'ir_assign', extraState: { n: 1 },
        data: JSON.stringify(stored),
        icons: { comment: { text: bubble, pinned: false, height: 80, width: 160 } },
        inputs: {
          TARGET0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
          VALUE: { shadow: { type: 'ir_const', fields: { VALUE: '0' } } } } },
    ] } };
    expect(IR.blocklyToIr(ws).body[0]._comments).toEqual(stored);
  });
```

- [ ] **Step 2: Run** — `npx playwright test tests/ir_comments.spec.js -g "edited|unedited bubble" --reporter=line`
Expected: PASS if Task 4's `readBlockComments` is correct. If FAIL, fix `readBlockComments` minimally and re-run.

- [ ] **Step 3: Live-UI edit round-trip (browser)** — append to the browser describe:

```js
  test('a comment edited in the live workspace survives regeneration', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const Blockly = window.Blockly;
      const ws = window.__blocklyWorkspace;
      ws.clear();
      const ir = await window.BlockPyAstBridge.pythonToIR(py, '# old\nx = 1');
      Blockly.serialization.workspaces.load(window.BlockPyIR.irToBlockly(ir), ws);
      const b = ws.getTopBlocks(false)[0];
      b.setCommentText('# new note');          // user edits the bubble
      b.data = b.data;                          // data still holds old structured comment
      const saved = Blockly.serialization.workspaces.save(ws);
      const back = window.BlockPyIR.blocklyToIr(saved);
      ws.clear();
      return window.BlockPyAstBridge.irToPython(py, back);
    });
    expect(out).toContain('# new note');
    expect(out).not.toContain('# old');
  });
```

Run: `$env:PORT="3100"; npx playwright test tests/ir_comments.spec.js -g "edited in the live" --reporter=line`
Expected: PASS.

- [ ] **Step 4: Regression** — `$env:PORT="3100"; npx playwright test tests/ir_comments.spec.js --reporter=line` → all PASS.

- [ ] **Step 5: Codex review (gate on blocking 0)** — Bash tool.

- [ ] **Step 6: Commit**

```bash
git reset -q HEAD package-lock.json
git add src/utils/blocklyToIr.js tests/ir_comments.spec.js
git commit -F - <<'EOF'
test(ir): lock comment edit-sync (bubble edit -> leading) (Phase 3 slice 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: Edge cases + round-trip corpus

Harden association at scope boundaries and lock a regression corpus.

**Files:**
- Test: `tests/ir_comments.spec.js`
- Modify (as the corpus reveals): `src/utils/pyAstBridge.js` (`_attach_comments`)

**Interfaces:**
- Consumes: the full pipeline (Tasks 1–4).

- [ ] **Step 1: Write the corpus test (browser)** — append to the browser describe:

```js
  const CORPUS = [
    '# only a module comment\nx = 1',
    'x = 1  # inline only',
    'def f():\n    # nested leading\n    return 1',
    'if a:\n    b = 1  # then\nelse:\n    c = 2  # else',
    'for i in items:\n    # loop body\n    use(i)\n# after the loop\ndone()',
    'class C:\n    # class body\n    x = 1  # field',
    'try:\n    risky()  # may fail\nexcept E:\n    pass  # swallow',
  ];

  test('comment corpus survives python -> blocks -> python', async ({ page }) => {
    const results = await page.evaluate(async (corpus) => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const commentsOf = (s) => (s.match(/#[^\n]*/g) || []).map((c) => c.trim()).sort();
      const out = [];
      for (const src of corpus) {
        const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
        const back = window.BlockPyIR.blocklyToIr(window.BlockPyIR.irToBlockly(ir));
        const code = await window.BlockPyAstBridge.irToPython(py, back);
        out.push({ src, code, inComments: commentsOf(src), outComments: commentsOf(code) });
      }
      return out;
    }, CORPUS);
    for (const r of results) {
      // Option 3: every comment is preserved (multiset, order-independent).
      expect(r.outComments, `comments lost for:\n${r.src}\n-> got:\n${r.code}`).toEqual(r.inComments);
    }
  });
```

- [ ] **Step 2: Run the corpus to find gaps**

Run: `$env:PORT="3100"; npx playwright test tests/ir_comments.spec.js -g "comment corpus" --reporter=line`
Expected: may FAIL on a scope-boundary case (e.g. `# after the loop` associating to the wrong stmt). The assertion message prints the failing snippet and the emitted code.

- [ ] **Step 3: Fix association for any failing case** — if a comment lands on the wrong statement, refine `_attach_comments` in `pyAstBridge.js`. The likely refinement is making the standalone-comment "next statement" search prefer a statement at the SAME indentation/column as the comment (scope-aware), falling back to the global nearest. Example refinement (apply only if needed):

```python
        # scope-aware standalone association: prefer a following stmt whose col_offset
        # matches the comment's column (same block), else the global nearest following stmt.
        if after:
            same_col = [s for s in after if s.col_offset == c['col']]
            target = min(same_col or after, key=lambda s: s.lineno)
            _set_cmt(target, 'leading', c['text'], True)
```

Re-run Step 2 until the corpus is green. Add any newly-discovered representative case to `CORPUS`.

- [ ] **Step 4: Full regression**

Run: `$env:PORT="3100"; npx playwright test tests/ir_comments.spec.js tests/ir_roundtrip.spec.js tests/ir_unit.spec.js tests/ir_toolbox.spec.js tests/ir_coverage.spec.js tests/ir_app_integration.spec.js --reporter=line`
Expected: all PASS.

- [ ] **Step 5: Live render check (optional, recommended)** — drag/Convert a commented snippet in the live app (`PORT=3100`) and confirm the comment bubble renders on the right block (reuse the `tmp/ir_batch_driver.mjs` approach from the toolbox verification, or `blockpy-roundtrip-verify`).

- [ ] **Step 6: Codex review (gate on blocking 0)** — Bash tool.

- [ ] **Step 7: Commit**

```bash
git reset -q HEAD package-lock.json
git add src/utils/pyAstBridge.js tests/ir_comments.spec.js
git commit -F - <<'EOF'
feat(ir): comment association edge cases + round-trip corpus (Phase 3 slice 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Done criteria

- Python(주석 포함) → 블록 → Python preserves every comment (corpus green, multiset match).
- Comments render as editable native bubbles on the right block; editing → leading on regenerate.
- No new dependency; `ast._Unparser` + `tokenize` only.
- All pre-existing IR suites green (no regression).
- Every slice passed Codex blocking 0; `package-lock.json` never committed.
