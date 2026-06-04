# Unseen-Library pip → Convert → Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a never-before-seen Python library install (pip/micropip), convert to Blockly blocks automatically on Convert (no AI button), and run — losslessly.

**Architecture:** Wire the parser's on-the-fly dynamic-block registration to a persistent React-owned `LibraryAbstractionEngine` exposed at `window.__blockpyEngine` (replacing the dead legacy `window.appOrchestrator` reference and its DOM-poking). After Convert, App syncs `installedBlocks` from the engine so the existing toolbox effect repaints the palette. Execution is unchanged (micropip auto-install).

**Tech Stack:** React 19 + Vite, hand-written compiler in `src/utils/parser.js` (global `window.BlockPyParser`), `LibraryAbstractionEngine` in `src/utils/libraryAbstraction.js` (`window.BlockPyAbstraction`), Pyodide, Playwright.

**Demo library:** `humanize` (pure-Python, micropip-installable). Verified outputs:
`humanize.intcomma(1234567)` → `1,234,567`, `humanize.ordinal(21)` → `21st`,
`humanize.naturalsize(1048576)` → `1.0 MB`.

---

### Task 1: Persistent engine exposed to the parser (`window.__blockpyEngine`)

**Files:**
- Modify: `src/App.jsx` (init effect near line 234–249; `syncCodeToBlocks` after line 96)

- [ ] **Step 1: Create one persistent engine and expose it**

In `src/App.jsx`, the init effect currently makes a throwaway engine for the cv2 preset
(`const engine = new window.BlockPyAbstraction.LibraryAbstractionEngine(null);`). Replace
that local with a module-persistent engine stored in a ref and on `window`:
```jsx
    // Persistent abstraction engine — shared with the parser for on-the-fly
    // dynamic-block registration during Convert.
    const engine = new window.BlockPyAbstraction.LibraryAbstractionEngine(null);
    abstractionEngineRef.current = engine;
    window.__blockpyEngine = engine;
```
Add the ref near the other refs at the top of the component:
```jsx
  const abstractionEngineRef = useRef(null);
```
Keep the existing cv2-preset registration loop, but have it use this same `engine` (it
already does) and keep `setInstalledBlocks(preloaded)`.

- [ ] **Step 2: After Convert, sync installedBlocks from the engine**

In `syncCodeToBlocks`, immediately after `window.Blockly.serialization.workspaces.load(blocklyJson, workspaceRef.current);`
(line 96), add:
```jsx
      // Pick up any dynamic library blocks the parser auto-registered during astToBlockly.
      const engine = abstractionEngineRef.current;
      if (engine && engine.activeBlocks && engine.activeBlocks.length > 0) {
        setInstalledBlocks((prev) => {
          const known = new Set(prev.map((p) => p.type));
          const added = engine.activeBlocks.filter((b) => !known.has(b.type));
          return added.length ? [...prev, ...added] : prev;
        });
      }
```

- [ ] **Step 3: Verify the app still loads (dev server already running on :3000)**

Run a quick smoke (no behavior change yet — parser still points at the old global):
```bash
cat > tests/_smoke_engine.spec.js << 'EOF'
const { test, expect } = require('@playwright/test');
test('engine exposed on window', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  expect(await page.evaluate(() => !!window.__blockpyEngine)).toBe(true);
});
EOF
npx playwright test tests/_smoke_engine.spec.js --reporter=line --workers=1
rm -f tests/_smoke_engine.spec.js
```
Expected: 1 passed.

- [ ] **Step 4: Commit**
```bash
git add src/App.jsx
git commit -m "feat: persistent LibraryAbstractionEngine exposed as window.__blockpyEngine"
```

---

### Task 2: Rewire the parser's auto-register to the React engine

**Files:**
- Modify: `src/utils/parser.js` (`convertCallExpression` auto-register branch, ~lines 3191–3231)

- [ ] **Step 1: Confirm current dead behavior**

```bash
node -e "const P=require('./src/utils/parser.js');const j=JSON.stringify(P.astToBlockly(new P.Parser(new P.Tokenizer('import humanize\nx = humanize.intcomma(1234567)').tokenize()).parse()));console.log('lib block:', j.includes('lib_humanize_intcomma'));console.log('raw fallback:', j.includes('raw_expression')||j.includes('raw_statement'));"
```
Expected now: `lib block: false` (Node has no `window.__blockpyEngine`), falls back. This
confirms the call currently does NOT auto-register in a bare Node context.

- [ ] **Step 2: Replace the legacy branch (registration only, no DOM)**

In `src/utils/parser.js`, replace the whole on-the-fly registration block — from
`if (!Blockly.Blocks[blockType] && typeof window !== 'undefined' && window.appOrchestrator && window.appOrchestrator.abstractionEngine) {`
through the closing `}` just before `if (Blockly.Blocks[blockType]) {` — with:
```js
    // On-the-fly dynamic block registration for an UNKNOWN library call.
    // Only real module calls (lib !== 'global'); bare user-function calls keep their
    // existing lossless representation. Registers the Blockly block ONLY — React owns the
    // palette/toolbox state and syncs from engine.activeBlocks after Convert.
    const engine = (typeof window !== 'undefined') ? window.__blockpyEngine : null;
    if (!Blockly.Blocks[blockType] && libName !== 'global' && engine) {
      const args = node.args.map((_, idx) => `param_${idx}`);
      const hasOutput = !isStatement;
      const colour = libName === 'cv2' ? '#06b6d4' : '#009688';
      const title = `${libName}.${funcName}`;
      engine.registerBlock(libName, funcName, args, hasOutput, colour, title);
      if (!engine.activeBlocks.some((b) => b.type === blockType)) {
        engine.activeBlocks.push({ type: blockType, title, hasOutput, func: funcName, args });
        engine.installedBlocksCount = (engine.installedBlocksCount || 0) + 1;
      }
    }
```

- [ ] **Step 3: Verify no stray `appOrchestrator` references remain**
```bash
grep -n "appOrchestrator" src/utils/parser.js
```
Expected: no output.

- [ ] **Step 4: Node sanity — a global user call is NOT turned into a lib block**
```bash
node -e "const P=require('./src/utils/parser.js');const j=JSON.stringify(P.astToBlockly(new P.Parser(new P.Tokenizer('inc()').tokenize()).parse()));console.log('no lib_global block:', !j.includes('lib_global_inc'))"
```
Expected: `no lib_global block: true`.

- [ ] **Step 5: Commit**
```bash
git add src/utils/parser.js
git commit -m "fix: auto-register unknown library blocks via window.__blockpyEngine (drop dead legacy path + DOM-poking)"
```

---

### Task 3: Browser test — unseen lib Convert auto-creates blocks & runs

**Files:**
- Create: `tests/unseen_library.spec.js`

- [ ] **Step 1: Write the failing test**

```js
const { test, expect } = require('@playwright/test');

test('unseen library (humanize): Convert auto-creates dynamic blocks, runs losslessly', async ({ page }) => {
  test.setTimeout(120000);
  const code = 'import humanize\nprint(humanize.intcomma(1234567))\nprint(humanize.ordinal(21))\nprint(humanize.naturalsize(1048576))';

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#tab-btn-python').click();
  await page.locator('#python-code').fill(code);
  await page.locator('#btn-sync-to-blocks').click();
  await page.waitForTimeout(1200);

  // Auto-registered dynamic blocks present; lib calls are NOT lossy raw_statements.
  const types = await page.evaluate(() =>
    window.Blockly.getMainWorkspace().getAllBlocks().map((b) => b.type));
  expect(types).toContain('lib_humanize_intcomma');
  expect(types).toContain('lib_humanize_ordinal');
  expect(types).toContain('lib_humanize_naturalsize');

  // Run: micropip installs humanize, prints the three lines.
  await page.locator('#tab-btn-logs').click();
  await page.locator('#btn-run').click();
  await page.waitForFunction(() => {
    const t = document.querySelector('#console-logs')?.textContent || '';
    return t.includes('Execution completed') || t.includes('Error');
  }, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(800);

  const logs = await page.locator('#console-logs').textContent();
  expect(logs).not.toContain('[Parser Error]');
  expect(logs).not.toContain('[Runtime Error]');
  expect(logs).toContain('1,234,567');
  expect(logs).toContain('21st');
  expect(logs).toContain('1.0 MB');
});
```

- [ ] **Step 2: Run it (passes after Tasks 1–2)**
```bash
npx playwright test tests/unseen_library.spec.js --reporter=line --workers=1
```
Expected: 1 passed. If `lib_humanize_*` blocks are missing, re-check Task 2's
`window.__blockpyEngine` guard and Task 1's exposure. If a `raw_statement` holds the lib
call, the detection branch didn't fire — verify `libName !== 'global'` and that the block
was not pre-registered under a different key.

- [ ] **Step 3: Commit**
```bash
git add tests/unseen_library.spec.js
git commit -m "test: unseen library (humanize) auto-converts to dynamic blocks and runs"
```

---

### Task 4: Add the humanize snippet to the demo gallery

**Files:**
- Modify: `src/examples/snippets.js` (new `Libraries` category entry)

- [ ] **Step 1: Append the snippet**

Add before the closing `];` of `DEMO_SNIPPETS`:
```js
  // ── Libraries (unseen, pip-installed) ────────────────────────────────────────
  // Demonstrates: micropip-install + auto block conversion + run for a library
  // BlockPy has no preset for. humanize is pure-Python and installs in Pyodide.
  {
    id: 'lib-humanize', title: '미지 라이브러리: humanize', category: 'Libraries', desugar: true, execute: true,
    code: 'import humanize\nprint(humanize.intcomma(1234567))\nprint(humanize.ordinal(21))\nprint(humanize.naturalsize(1048576))',
    expectedStdout: ['1,234,567', '21st', '1.0 MB'],
  },
];
```

- [ ] **Step 2: AST round-trip sanity (Node)**
```bash
node -e "const {DEMO_SNIPPETS}=require('./src/examples/snippets.js');const P=require('./src/utils/parser.js');const norm=s=>s.replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();const sn=DEMO_SNIPPETS.find(s=>s.id==='lib-humanize');const out=P.astToPython(new P.Parser(new P.Tokenizer(sn.code).tokenize()).parse());console.log(norm(out)===norm(sn.code)?'OK':'FAIL',JSON.stringify(norm(out)))"
```
Expected: `OK`.

- [ ] **Step 3: Run the gallery suite (humanize snippet now included)**

The gallery execute-test fills the editor and Converts; because Task 2 auto-registers the
blocks, the lib calls are dynamic blocks (not lossy text). Run:
```bash
npx playwright test tests/examples_roundtrip.spec.js -g "lib-humanize|Libraries" --reporter=line --workers=1
```
Expected: 2 passed (AST round-trip + render/run). The render check asserts no lossy
`text`-of-source block; dynamic `lib_humanize_*` blocks satisfy it. If the render test
flags a `text` block, confirm Task 2 fired during this Convert (the engine persists across
the session, so order-independent).

- [ ] **Step 4: Commit**
```bash
git add src/examples/snippets.js
git commit -m "feat: demo gallery snippet for an unseen pip-installed library (humanize)"
```

---

### Task 5: Full regression + lint pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full demo gallery suite**
```bash
npx playwright test tests/examples_roundtrip.spec.js --reporter=line --workers=1
```
Expected: all pass (was 34; now 36 with the humanize AST + run tests).

- [ ] **Step 2: Run the prior regression suites**
```bash
npx playwright test tests/test_p0_p1.spec.js tests/test_new_blocks.spec.js --reporter=line --workers=1
```
Expected: all pass (no regression from the parser change).

- [ ] **Step 3: Confirm the unseen-lib spec still passes**
```bash
npx playwright test tests/unseen_library.spec.js --reporter=line --workers=1
```
Expected: 1 passed.

- [ ] **Step 4: Commit any test-results cleanup (none expected)**

No code change; if all green, sub-project B is complete.

---

## Self-Review

**Spec coverage:** Architecture (parser→`window.__blockpyEngine`, App owns state) → Tasks 1–2. Detection rule (`lib !== 'global'`, skip print/range/sprite/cv2) → Task 2 (print/range already guarded above the branch; sprite/cv2 handled earlier in `convertCallExpression`). Lossless round-trip → Task 3 (block-path) + Task 4 (AST). Demo library & scenario → Tasks 3–4. Execution unchanged → relies on existing micropip path, exercised in Tasks 3–5.

**Placeholder scan:** No TBD/TODO; every code step shows full code; test bodies are complete.

**Type/identifier consistency:** `window.__blockpyEngine` used identically in Task 1 (set) and Task 2 (read). `abstractionEngineRef` defined and used in Task 1. `engine.activeBlocks` entry shape `{ type, title, hasOutput, func, args }` matches what `installedBlocks` consumers expect (`b.type`, `b.title`, `b.hasOutput`). Dynamic block type `lib_<lib>_<func>` consistent across Tasks 2, 3, 4.

**Known limitation (documented, in spec scope):** dynamic block key is `lib_<lib>_<func>` (no arity suffix); a same-named function later called with different arity would reuse the first block. Out of scope for the demo (each humanize function is called once at fixed arity); noted rather than silently handled.
