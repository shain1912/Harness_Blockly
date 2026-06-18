# 동적/AI 라이브러리 블록 (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라이브러리 함수 하나당 이름붙은 단일 호출 블록(Tier-A)을 프리셋/인트로스펙션/AI로 등록해 드래그 작성하게 하고, 기존 IR 파이프라인으로 무손실 lower한다.

**Architecture:** Tier-A 블록은 새 IR 노드가 아니라 `Call` IR의 "스킨"이다. 블록이 `{module, func, argNames}` 메타데이터를 들고 있다가 `blocklyToIr`의 단일 fallback 훅에서 Tier-B(`ir_call`/`ir_attribute`)와 **동일한 `Call` IR**로 lower된다 → 왕복 무손실 공짜. 단방향 오서링 전용이라 `irToBlockly`(역방향)는 손대지 않는다. 레지스트리가 lower·툴박스·영속화·UI의 단일 진실원본이며 localStorage로 세션 간 유지된다.

**Tech Stack:** React 19 + Vite, Blockly(CDN), Pyodide(CPython 3.12 `ast`), Express 백엔드(`/api/ai-abstract` → MiniMax), Playwright e2e.

## Global Constraints

- **선행 설계:** `DOCS/superpowers/specs/2026-06-18-dynamic-ai-library-blocks-design.md`.
- **테스트 실행:** 항상 `PORT=3100 npx playwright test ...` (포트 3000은 타 프로젝트 점유). 단일 파일/단일 타이틀만 실행, 동시 실행 금지.
- **커밋 트레일러(정확히):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **`package-lock.json`은 어떤 커밋에도 포함 금지** (작업트리에 기존-수정 상태로 있음 — 절대 `git add` 하지 말 것). `git add`는 항상 명시적 파일 경로로만.
- **푸시 금지** (사용자 지시: 공개 리포라 로컬에만 유지). 커밋만.
- **브랜치:** `feature/ast-ir-redesign`에서 작업.
- **단일 IR 정합성:** `lowerLibBlock`이 내는 `Call` IR은 `ir_call`/`ir_attribute`가 내는 것과 **동일 스키마**여야 한다 (field 이름 일치).
- **Codex 게이트:** 각 슬라이스(태스크) 종료 시 `codex exec review "$(cat scripts/codex-review-prompt.md)"` 적대 리뷰 → blocking 0 → 커밋. (Bash 도구로 실행, PowerShell 아님.)
- **`window` vs `global`:** 모든 신규 코드는 `(typeof window !== 'undefined' ? window : global)` 패턴으로 브라우저·node 양쪽 동작. node 테스트는 `require(...)` 후 `global.BlockPy*` 사용.

## File Structure

- **Create** `src/utils/libRegistry.js` — 레지스트리 + 오라클. `window.BlockPyLibRegistry` 노출. 단일 책임: 등록/검증/조회/영속화.
- **Modify** `src/utils/blocklyToIr.js` — `lowerLibBlock` 헬퍼 추가 + `blockToExpr`/`blockToStmt`에 fallback 훅. (`topToStmt`는 변경 없음 — 기존 `return blockToStmt(b)` fallthrough가 처리.)
- **Modify** `src/utils/irToolbox.js` — `buildIrToolbox()`가 레지스트리에서 "Library" 카테고리 추가, 재빌드 함수 `window.BlockPyBuildIrToolbox` 노출.
- **Modify** `src/main.jsx` — `libRegistry.js` side-effect import (irToolbox.js 앞).
- **Modify** `src/App.jsx` — inert effect를 toolbox 재빌드로 부활, mount 시 `hydrate()`, `handleAbstractLibrary`를 레지스트리+오라클+503 폴백으로 재배선.
- **Create** `tests/ir_lib_blocks.spec.js` — node(레지스트리·lower) + browser(툴박스·파이프라인·영속화) 테스트.

---

### Task 1: libRegistry — 레지스트리 + 오라클 정적검사 + 영속화

**Files:**
- Create: `src/utils/libRegistry.js`
- Test: `tests/ir_lib_blocks.spec.js` (node describe: "lib registry (node)")

**Interfaces:**
- Consumes: 없음 (독립). 브라우저에서 `window.Blockly`(있으면 블록 정의), `window.localStorage`(있으면 영속화); 둘 다 없으면 가드하고 Map 로직만 동작.
- Produces (`window.BlockPyLibRegistry` / `module.exports`):
  - `registerLibBlock(spec) → { ok:true, type } | { ok:false, reason }`. `spec = { module:string|'', func:string, argNames:string[], hasOutput:boolean, colour?:string, title?:string }`. 정적검사 통과 시 `Blockly.Blocks[type]` 정의 + `Map<type,spec>` 저장.
  - `getLibSpec(type) → spec | undefined`
  - `listLibBlocks() → [{ module:string, blocks:[{ type, title, argNames, hasOutput }] }]`
  - `removeLibrary(module) → void` (Map 삭제 + persist)
  - `clearAll() → void`
  - `persist() → void` (localStorage 저장)
  - `hydrate() → [{ type, title, hasOutput, func, args, colour }]` (재등록 + UI용 리스트 반환)
  - `validateSpecParse(spec, pythonToIR, pyodide) → Promise<boolean>` (오라클 파싱검사; async)
  - `blockType(spec) → string`, `staticCheck(spec) → string|null`
  - 블록타입 규칙: `` `lib_${module}_${func}${hasOutput ? '' : '_stmt'}` ``

- [ ] **Step 1: 실패 테스트 작성** — `tests/ir_lib_blocks.spec.js` 생성

```js
const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:' + (process.env.PORT || '3000') + '/';

// ── Node-level (no browser) ─────────────────────────────────────────────────
require('../src/utils/libRegistry.js');
const REG = global.BlockPyLibRegistry;

test.describe('lib registry (node)', () => {
  test.beforeEach(() => REG.clearAll());

  test('registers a valid module.func spec and computes the block type', () => {
    const res = REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    expect(res.ok).toBe(true);
    expect(res.type).toBe('lib_cv2_imread');
    expect(REG.getLibSpec('lib_cv2_imread')).toMatchObject({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
  });

  test('statement-form spec gets the _stmt suffix', () => {
    const res = REG.registerLibBlock({ module: 'cv2', func: 'imshow', argNames: ['winname', 'mat'], hasOutput: false });
    expect(res.type).toBe('lib_cv2_imshow_stmt');
  });

  test('rejects an invalid func identifier (oracle static check)', () => {
    const res = REG.registerLibBlock({ module: 'cv2', func: '2bad', argNames: [], hasOutput: true });
    expect(res.ok).toBe(false);
    expect(REG.getLibSpec('lib_cv2_2bad')).toBeUndefined();
  });

  test('rejects duplicate arg names', () => {
    const res = REG.registerLibBlock({ module: 'm', func: 'f', argNames: ['a', 'a'], hasOutput: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('duplicate');
  });

  test('listLibBlocks groups by module', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['f'], hasOutput: true });
    REG.registerLibBlock({ module: 'cv2', func: 'waitKey', argNames: ['d'], hasOutput: true });
    REG.registerLibBlock({ module: 'math', func: 'sqrt', argNames: ['x'], hasOutput: true });
    const groups = REG.listLibBlocks();
    const cv2 = groups.find((g) => g.module === 'cv2');
    expect(cv2.blocks.map((b) => b.type).sort()).toEqual(['lib_cv2_imread', 'lib_cv2_waitKey']);
    expect(cv2.blocks[0]).toHaveProperty('argNames');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `PORT=3100 npx playwright test tests/ir_lib_blocks.spec.js -g "lib registry (node)"`
Expected: FAIL — `Cannot find module '../src/utils/libRegistry.js'`.

- [ ] **Step 3: `src/utils/libRegistry.js` 구현**

```js
/* libRegistry.js — Phase 5 dynamic/AI library block registry (Tier-A authoring blocks).
 *
 * Single source of truth for registered library CALL blocks. A Tier-A block is a "skin" over a
 * Call IR: it carries {module, func, argNames} and lowers (in blocklyToIr) to the exact same Call
 * IR as the Tier-B ir_call/ir_attribute path — so round-trip is lossless. Authoring-only:
 * Python->blocks always yields Tier-B; irToBlockly is untouched. Works in node (Blockly /
 * localStorage absent → visual-def and persistence are no-ops; Map + oracle still run) so the
 * registry can be unit-tested without a browser.
 */

const SPECS = new Map();                 // block type -> normalized spec
const STORAGE_KEY = 'blockpy.libRegistry.v1';
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function blockType(spec) {
  return `lib_${spec.module || ''}_${spec.func}${spec.hasOutput ? '' : '_stmt'}`;
}

// Synchronous half of the round-trip oracle (no Pyodide). Returns an error string or null (ok).
function staticCheck(spec) {
  if (!spec || typeof spec.func !== 'string' || !IDENT.test(spec.func)) return 'func is not a valid Python identifier';
  if (spec.module && !IDENT.test(spec.module)) return 'module is not a valid Python identifier';
  const args = spec.argNames || [];
  if (!Array.isArray(args)) return 'argNames must be an array';
  const seen = new Set();
  for (const a of args) {
    if (typeof a !== 'string' || !IDENT.test(a)) return 'arg name is not a valid identifier: ' + a;
    if (seen.has(a)) return 'duplicate arg name: ' + a;
    seen.add(a);
  }
  return null;
}

// Define the visual Blockly block (NO legacy Blockly.Python generator — lowering goes via IR).
function defineBlock(type, spec) {
  const B = (typeof window !== 'undefined' ? window : global).Blockly;
  if (!B || !B.Blocks) return;           // node / pre-Blockly: skip visual def, keep the Map entry
  if (B.Blocks[type]) return;            // idempotent (Blockly throws on redefinition)
  const argNames = spec.argNames || [];
  const title = spec.title;
  const colour = spec.colour;
  const hasOutput = spec.hasOutput;
  const tip = `${spec.module ? spec.module + '.' : ''}${spec.func}()`;
  B.Blocks[type] = {
    init: function () {
      this.appendDummyInput().appendField(title);
      argNames.forEach((argName, idx) => {
        this.appendValueInput('ARG' + idx).setCheck(null).appendField(argName);
      });
      if (hasOutput) this.setOutput(true, null);
      else { this.setPreviousStatement(true, null); this.setNextStatement(true, null); }
      this.setColour(colour);
      this.setTooltip(tip);
    },
  };
}

function registerLibBlock(spec) {
  const reason = staticCheck(spec);
  if (reason) return { ok: false, reason };
  const stored = {
    module: spec.module || '',
    func: spec.func,
    argNames: (spec.argNames || []).slice(),
    hasOutput: !!spec.hasOutput,
    colour: spec.colour || '#009688',
    title: spec.title || `${spec.module ? spec.module + '.' : ''}${spec.func}`,
  };
  const type = blockType(stored);
  SPECS.set(type, stored);
  defineBlock(type, stored);
  return { ok: true, type };
}

function getLibSpec(type) { return SPECS.get(type); }

function listLibBlocks() {
  const byModule = new Map();
  for (const [type, spec] of SPECS) {
    const mod = spec.module || '';
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push({ type, title: spec.title, argNames: spec.argNames, hasOutput: spec.hasOutput });
  }
  return [...byModule.entries()].map(([module, blocks]) => ({ module, blocks }));
}

function removeLibrary(module) {
  for (const [type, spec] of [...SPECS]) if ((spec.module || '') === module) SPECS.delete(type);
  persist();
}

function clearAll() { SPECS.clear(); }

function persist() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return;
    ls.setItem(STORAGE_KEY, JSON.stringify([...SPECS.values()]));
  } catch (_) { /* non-fatal */ }
}

// Re-register every persisted spec (restores Blockly.Blocks defs after reload). Returns the
// installedBlocks-shaped list the UI keeps in React state.
function hydrate() {
  try {
    const ls = (typeof window !== 'undefined') ? window.localStorage : null;
    if (!ls) return [];
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return [];
    const specs = JSON.parse(raw);
    if (!Array.isArray(specs)) return [];
    const out = [];
    for (const spec of specs) {
      const res = registerLibBlock(spec);
      if (res.ok) out.push({ type: res.type, title: spec.title, hasOutput: !!spec.hasOutput, func: spec.func, args: spec.argNames || [], colour: spec.colour });
    }
    return out;
  } catch (_) { clearAll(); return []; }
}

// Async half of the oracle: confirm the spec lowers to a call that re-parses to a single
// Expr(Call) with matching func + arity. pythonToIR(pyodide, code) -> IR Module.
async function validateSpecParse(spec, pythonToIR, pyodide) {
  try {
    const argList = (spec.argNames || []).join(', ');
    const callExpr = spec.module ? `${spec.module}.${spec.func}(${argList})` : `${spec.func}(${argList})`;
    const ir = await pythonToIR(pyodide, callExpr);
    if (!ir || ir.type !== 'Module' || !Array.isArray(ir.body) || ir.body.length !== 1) return false;
    const st = ir.body[0];
    if (st.type !== 'Expr' || !st.value || st.value.type !== 'Call') return false;
    const call = st.value;
    if ((call.args || []).length !== (spec.argNames || []).length) return false;
    if (spec.module) {
      return !!(call.func && call.func.type === 'Attribute' && call.func.attr === spec.func
        && call.func.value && call.func.value.type === 'Name' && call.func.value.id === spec.module);
    }
    return !!(call.func && call.func.type === 'Name' && call.func.id === spec.func);
  } catch (_) { return false; }
}

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyLibRegistry = {
  registerLibBlock, getLibSpec, listLibBlocks, removeLibrary, clearAll,
  persist, hydrate, validateSpecParse, blockType, staticCheck,
};
if (typeof module !== 'undefined') module.exports = api.BlockPyLibRegistry;
```

- [ ] **Step 4: 통과 확인**

Run: `PORT=3100 npx playwright test tests/ir_lib_blocks.spec.js -g "lib registry (node)"`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/utils/libRegistry.js tests/ir_lib_blocks.spec.js
git commit -m "$(cat <<'EOF'
feat(ir): lib block registry + oracle static check (Phase 5 slice 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Codex 게이트** (Bash 도구) — `codex exec review "$(cat scripts/codex-review-prompt.md)"` → blocking 0 확인, 지적 반영.

---

### Task 2: blocklyToIr lower 훅 — Tier-A 블록 → Call IR

**Files:**
- Modify: `src/utils/blocklyToIr.js` (`blockToExpr` 388–393, `blockToStmt` 395–403; 신규 `lowerLibBlock` 헬퍼)
- Test: `tests/ir_lib_blocks.spec.js` (node describe: "lib lower hook (node)")

**Interfaces:**
- Consumes: `BlockPyLibRegistry.getLibSpec(type)` (Task 1).
- Produces: `blockToExpr`가 lib 블록 → `{ type:'Call', func, args, keywords:[] }`(bare Call); `blockToStmt`가 문장형 lib 블록 → `{ type:'Expr', value:<Call> }`. `irToBlockly`가 `ir_call`/`ir_attribute`에 쓰는 것과 동일한 `Call`/`Attribute`/`Name` 스키마.

- [ ] **Step 1: 실패 테스트 작성** — `tests/ir_lib_blocks.spec.js`에 append

```js
// ── lib lower hook (node) ───────────────────────────────────────────────────
require('../src/utils/irToBlockly.js');   // BlockPyIR.renderComments (used by blocklyToIr)
require('../src/utils/blocklyToIr.js');
const IR = global.BlockPyIR;

test.describe('lib lower hook (node)', () => {
  test.beforeEach(() => REG.clearAll());

  test('output-form lib block lowers to module.func Call IR (as a bare Expr at top level)', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    const ws = { blocks: { blocks: [
      { type: 'lib_cv2_imread', inputs: { ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"x"' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body).toHaveLength(1);
    expect(ir.body[0]).toMatchObject({
      type: 'Expr',
      value: {
        type: 'Call',
        func: { type: 'Attribute', attr: 'imread', value: { type: 'Name', id: 'cv2' } },
        args: [{ type: 'Constant', value: 'x' }],
        keywords: [],
      },
    });
  });

  test('statement-form lib block lowers to a bare-call Expr', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imshow', argNames: ['winname', 'mat'], hasOutput: false });
    const ws = { blocks: { blocks: [
      { type: 'lib_cv2_imshow_stmt', inputs: {
        ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"win"' } } },
        ARG1: { shadow: { type: 'ir_name', fields: { ID: 'img' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0]).toMatchObject({ type: 'Expr', value: { type: 'Call', func: { attr: 'imshow' } } });
    expect(ir.body[0].value.args).toHaveLength(2);
  });

  test('bare-func (no module) lib block lowers to Name-call', () => {
    REG.registerLibBlock({ module: '', func: 'helper', argNames: ['x'], hasOutput: true });
    const ws = { blocks: { blocks: [
      { type: 'lib__helper', inputs: { ARG0: { shadow: { type: 'ir_name', fields: { ID: 'v' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0].value.func).toMatchObject({ type: 'Name', id: 'helper' });
  });

  test('lib block as an ARG of a real ir_call lowers to a bare Call (no Expr wrap)', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    const ws = { blocks: { blocks: [
      { type: 'ir_call', extraState: { nargs: 1, kw: [] }, inputs: {
        FUNC: { shadow: { type: 'ir_name', fields: { ID: 'print' } } },
        ARG0: { block: { type: 'lib_cv2_imread', inputs: { ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"x"' } } } } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0].value.args[0]).toMatchObject({ type: 'Call', func: { attr: 'imread' } });
  });

  test('a truly unknown block type still throws (no silent swallow)', () => {
    const ws = { blocks: { blocks: [{ type: 'totally_unknown_block' }] } };
    expect(() => IR.blocklyToIr(ws)).toThrow(/no stmt handler for totally_unknown_block/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `PORT=3100 npx playwright test tests/ir_lib_blocks.spec.js -g "lib lower hook"`
Expected: FAIL — `blocklyToIr: no stmt handler for lib_cv2_imread`.

- [ ] **Step 3: `lowerLibBlock` 헬퍼 추가** — `src/utils/blocklyToIr.js`, `function blockToExpr(b)` 정의 **바로 위**에 삽입

```js
// Phase 5: a registered Tier-A library block lowers to the SAME Call IR as the Tier-B
// ir_call/ir_attribute path (module.func(args) or func(args)). Returns null for a non-library
// (truly unknown) type so the caller emits its canonical "no handler" error. Function
// declaration → hoisted, so the forward reference to blockToExpr is fine.
function lowerLibBlock(b) {
  const reg = (typeof window !== 'undefined' ? window : global).BlockPyLibRegistry;
  const spec = (reg && typeof reg.getLibSpec === 'function') ? reg.getLibSpec(b.type) : null;
  if (!spec) return null;
  const args = (spec.argNames || []).map((_, i) => blockToExpr(b.inputs['ARG' + i].block));
  const func = spec.module
    ? { type: 'Attribute', value: { type: 'Name', id: spec.module }, attr: spec.func }
    : { type: 'Name', id: spec.func };
  return { type: 'Call', func, args, keywords: [] };
}
```

- [ ] **Step 4: `blockToExpr`에 fallback 훅** — 기존 함수를 교체

```js
function blockToExpr(b) {
  normInputs(b);
  const h = BLOCK_TO_EXPR[b.type];
  if (h) return h(b);
  const lib = lowerLibBlock(b);                 // Phase 5: Tier-A library block -> bare Call
  if (lib) return lib;
  throw new Error('blocklyToIr: no expr handler for ' + b.type);
}
```

- [ ] **Step 5: `blockToStmt`에 fallback 훅** — 기존 함수를 교체

```js
function blockToStmt(b) {
  normInputs(b);
  const h = BLOCK_TO_STMT[b.type];
  let stmt;
  if (h) {
    stmt = h(b);
  } else {
    const lib = lowerLibBlock(b);               // Phase 5: statement-form Tier-A block -> Expr(Call)
    if (!lib) throw new Error('blocklyToIr: no stmt handler for ' + b.type);
    stmt = { type: 'Expr', value: lib };
  }
  const cm = readBlockComments(b);
  if (cm) stmt._comments = cm;
  return stmt;
}
```

> `topToStmt`는 수정하지 않는다. 최상위 lib 블록은 `BLOCK_TO_STMT`/`BLOCK_TO_EXPR` 양쪽 미스 → 기존 마지막 줄 `return blockToStmt(b)`로 떨어지고, 위 fallback이 `Expr(Call)`로 감싼다(출력형·문장형 공통). 주석도 `blockToStmt` 안에서 부착됨.

- [ ] **Step 6: 통과 확인**

Run: `PORT=3100 npx playwright test tests/ir_lib_blocks.spec.js -g "lib lower hook"`
Expected: PASS (5 tests). 회귀 확인: `PORT=3100 npx playwright test tests/ir_comments.spec.js` PASS 유지.

- [ ] **Step 7: 커밋**

```bash
git add src/utils/blocklyToIr.js tests/ir_lib_blocks.spec.js
git commit -m "$(cat <<'EOF'
feat(ir): blocklyToIr lower hook for Tier-A library blocks (Phase 5 slice 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Codex 게이트** (Bash) — 리뷰 → blocking 0.

---

### Task 3: 툴박스 Library 카테고리 + 앱 배선(inert effect 부활)

**Files:**
- Modify: `src/utils/irToolbox.js` (`buildIrToolbox` 123–139; 신규 `libraryCategory`; 노출부 141–143)
- Modify: `src/main.jsx` (line 9 부근 — `libRegistry.js` import 추가)
- Modify: `src/App.jsx` (inert effect 261–288 교체; mount hydrate effect 추가)
- Test: `tests/ir_lib_blocks.spec.js` (browser describe: "lib toolbox + drag (browser)")

**Interfaces:**
- Consumes: `BlockPyLibRegistry.listLibBlocks()`, `.registerLibBlock()`, `.hydrate()` (Task 1); `BlockPyIR.blocklyToIr` (Task 2); `BlockPyAstBridge.irToPython`/`getPyodide`.
- Produces: `window.BlockPyBuildIrToolbox()` → 라이브러리 카테고리가 포함된 `categoryToolbox` JSON. App이 `installedBlocks` 변경 시 `workspace.updateToolbox(window.BlockPyBuildIrToolbox())` 호출.

- [ ] **Step 1: 실패 테스트 작성** — `tests/ir_lib_blocks.spec.js`에 append

```js
// ── lib toolbox + drag (browser) ────────────────────────────────────────────
test.describe('lib toolbox + drag (browser)', () => {
  test('registered lib block produces a Library toolbox category and round-trips to Python', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__blocklyWorkspace && window.BlockPyIR && window.BlockPyAstBridge
        && window.BlockPyLibRegistry && window.BlockPyBuildIrToolbox,
      null, { timeout: 180000 });

    const out = await page.evaluate(async () => {
      const reg = window.BlockPyLibRegistry;
      reg.clearAll();
      reg.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true, colour: '#06b6d4', title: 'cv2.imread' });

      // toolbox now carries a "Library" category with the registered block + an ARG0 shadow
      const tb = window.BlockPyBuildIrToolbox();
      const lib = tb.contents.find((c) => c.name === 'Library');
      const entry = lib && lib.contents.find((b) => b.type === 'lib_cv2_imread');

      // load a workspace holding the lib block and convert via the IR pipeline
      const ws = { blocks: { blocks: [
        { type: 'lib_cv2_imread', inputs: { ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"x"' } } } } },
      ] } };
      const ir = window.BlockPyIR.blocklyToIr(ws);
      const py = await window.BlockPyAstBridge.getPyodide();
      const code = await window.BlockPyAstBridge.irToPython(py, ir);
      return { hasLibCat: !!lib, hasEntry: !!entry, hasArgShadow: !!(entry && entry.inputs && entry.inputs.ARG0), code: code.trim() };
    });

    expect(out.hasLibCat).toBe(true);
    expect(out.hasEntry).toBe(true);
    expect(out.hasArgShadow).toBe(true);
    expect(out.code).toBe("cv2.imread('x')");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `PORT=3100 npx playwright test tests/ir_lib_blocks.spec.js -g "lib toolbox"`
Expected: FAIL — `window.BlockPyBuildIrToolbox` 미정의(waitForFunction timeout) 또는 `hasLibCat=false`.

- [ ] **Step 3: `irToolbox.js`에 Library 카테고리 빌더 추가** — `function buildIrToolbox()` 정의 **바로 위**에 삽입

```js
// Phase 5: a dynamic "Library" category compiled from the live registry (BlockPyLibRegistry).
// Each Tier-A block gets an ir_name shadow per arg so a freshly-dragged block is valid Python
// immediately (e.g. cv2.imread(filename)). Returns null when no library blocks are registered.
function libraryCategory() {
  const reg = (typeof window !== 'undefined' ? window : global).BlockPyLibRegistry;
  if (!reg || typeof reg.listLibBlocks !== 'function') return null;
  const groups = reg.listLibBlocks();
  if (!groups || !groups.length) return null;
  const blocks = [];
  groups.forEach((g) => {
    g.blocks.forEach((b) => {
      const inputs = {};
      (b.argNames || []).forEach((argName, i) => { inputs['ARG' + i] = name(argName); });
      const entry = { kind: 'block', type: b.type };
      if (Object.keys(inputs).length) entry.inputs = inputs;
      blocks.push(entry);
    });
  });
  return { kind: 'category', name: 'Library', colour: '#009688', contents: blocks };
}
```

- [ ] **Step 4: `buildIrToolbox`가 Library 카테고리를 append** — 기존 함수를 교체

```js
// Compile the table to a Blockly categoryToolbox JSON object (+ a dynamic Library category).
function buildIrToolbox() {
  const contents = IR_TOOLBOX_TABLE.map((cat) => ({
    kind: 'category',
    name: cat.name,
    colour: cat.colour,
    contents: cat.blocks.map((b) => {
      const block = { kind: 'block', type: b.type };
      if (b.extraState) block.extraState = b.extraState;
      if (b.fields) block.fields = b.fields;
      if (b.inputs) block.inputs = b.inputs;
      return block;
    }),
  }));
  const lib = libraryCategory();
  if (lib) contents.push(lib);
  return { kind: 'categoryToolbox', contents };
}
```

- [ ] **Step 5: 재빌드 함수 노출** — `irToolbox.js` 하단 노출부를 교체

```js
const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyIrToolbox = buildIrToolbox();        // initial (registry empty at module-load time)
api.BlockPyBuildIrToolbox = buildIrToolbox;     // Phase 5: re-callable to refresh the Library category
if (typeof module !== 'undefined') module.exports = { buildIrToolbox, IR_TOOLBOX_TABLE };
```

- [ ] **Step 6: `main.jsx`에 import 추가** — line 9 `import './utils/libraryAbstraction.js';` **다음 줄**에 삽입

```js
import './utils/libRegistry.js';   // Phase 5: window.BlockPyLibRegistry (load before irToolbox.js)
```

- [ ] **Step 7: App.jsx — inert effect를 toolbox 재빌드로 교체** — 261–288 블록 전체를 교체

```js
  // Dynamic-library palette (Phase 5): when the registry changes (hydrate on mount, or a new
  // AI/preset registration), rebuild the JSON toolbox so the "Library" category reflects the
  // live registry. Blockly diffs categoryToolbox JSON on updateToolbox(). Children-first effect
  // ordering means BlocklyEditor has already injected (workspaceRef set) before this runs.
  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws || typeof window.BlockPyBuildIrToolbox !== 'function') return;
    try {
      ws.updateToolbox(window.BlockPyBuildIrToolbox());
    } catch (e) {
      console.error('Failed to refresh library toolbox:', e);
    }
  }, [installedBlocks]);
```

- [ ] **Step 8: App.jsx — mount 시 hydrate** — 위 effect **바로 다음**에 삽입

```js
  // Phase 5: restore the persisted library registry on mount (re-registers Blockly.Blocks defs
  // and repopulates the palette without another AI call).
  useEffect(() => {
    const reg = window.BlockPyLibRegistry;
    if (!reg || typeof reg.hydrate !== 'function') return;
    const restored = reg.hydrate();
    if (restored && restored.length) setInstalledBlocks(restored);
  }, []);
```

- [ ] **Step 9: 통과 확인**

Run: `PORT=3100 npx playwright test tests/ir_lib_blocks.spec.js -g "lib toolbox"`
Expected: PASS.

- [ ] **Step 10: 커밋**

```bash
git add src/utils/irToolbox.js src/main.jsx src/App.jsx tests/ir_lib_blocks.spec.js
git commit -m "$(cat <<'EOF'
feat(ir): Library toolbox category + registry-driven rebuild (Phase 5 slice 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: Codex 게이트** (Bash) — blocking 0.

---

### Task 4: 파이프라인 — 프리셋 / AI / 인트로스펙션 + 오라클 + 503 폴백

**Files:**
- Modify: `src/App.jsx` (`handleAbstractLibrary` 589–651 전체 교체)
- Test: `tests/ir_lib_blocks.spec.js` (browser describe: "lib pipeline (browser)")

**Interfaces:**
- Consumes: `BlockPyLibRegistry.registerLibBlock/validateSpecParse/persist` (Task 1); `BlockPyAbstraction.AI_PRESETS`, `.LibraryAbstractionEngine.introspectModule`; `BlockPyAstBridge.getPyodide/pythonToIR`; `/api/ai-abstract`.
- Produces: `handleAbstractLibrary(libKey, customCode)`가 spec들을 오라클 통과시켜 registry에 등록 → `persist()` → `setInstalledBlocks(...)` → (Task 3 effect가 툴박스 재빌드). 매크로형/오라클 실패 spec은 skip + 로그.

- [ ] **Step 1: 실패 테스트 작성** — `tests/ir_lib_blocks.spec.js`에 append. (백엔드 키가 없을 수 있으므로 `/api/ai-abstract`를 라우트 목으로 고정 — 서버 불필요, 파이프라인 로직만 검증.)

```js
// ── lib pipeline (browser) ──────────────────────────────────────────────────
test.describe('lib pipeline (browser)', () => {
  test('AI response blocks are oracle-gated, registered, and bad specs rejected', async ({ page }) => {
    // Mock the AI endpoint: one good block (imread) + one invalid block (func "2bad").
    await page.route('**/api/ai-abstract', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, libName: 'cv2', thoughts: ['t1'], blocks: [
        { func: 'imread', args: ['filename'], hasOutput: true, colour: '#06b6d4', title: 'cv2.imread' },
        { func: '2bad', args: [], hasOutput: true, colour: '#000', title: 'cv2.2bad' },
      ] }),
    }));
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__blocklyWorkspace && window.BlockPyLibRegistry && window.BlockPyAbstraction
        && window.BlockPyAstBridge, null, { timeout: 180000 });
    await page.evaluate(() => window.BlockPyLibRegistry.clearAll());

    // Open the Library manager and trigger generation for cv2 (UI path).
    await page.click('#tab-btn-library');
    await page.selectOption('#abstract-lib-select', 'cv2');
    await page.click('#btn-generate-blocks');

    // wait until the good block registered (the invalid one must be rejected)
    await page.waitForFunction(
      () => !!window.BlockPyLibRegistry.getLibSpec('lib_cv2_imread'), null, { timeout: 30000 });
    const state = await page.evaluate(() => ({
      good: !!window.BlockPyLibRegistry.getLibSpec('lib_cv2_imread'),
      bad: !!window.BlockPyLibRegistry.getLibSpec('lib_cv2_2bad'),
    }));
    expect(state.good).toBe(true);
    expect(state.bad).toBe(false);
  });

  test('503 (no keys) falls back to the offline preset', async ({ page }) => {
    await page.route('**/api/ai-abstract', (route) => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: 'No MiniMax API keys configured.' }),
    }));
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__blocklyWorkspace && window.BlockPyLibRegistry && window.BlockPyAbstraction,
      null, { timeout: 180000 });
    await page.evaluate(() => window.BlockPyLibRegistry.clearAll());

    await page.click('#tab-btn-library');
    await page.selectOption('#abstract-lib-select', 'math');
    await page.click('#btn-generate-blocks');

    await page.waitForFunction(
      () => !!window.BlockPyLibRegistry.getLibSpec('lib_math_sqrt'), null, { timeout: 30000 });
    const ok = await page.evaluate(() => !!window.BlockPyLibRegistry.getLibSpec('lib_math_sin'));
    expect(ok).toBe(true);
  });
});
```

> **선행 확인:** `src/components/LibraryManager.jsx`의 셀렉트/버튼에 위 셀렉터(`#tab-btn-library`, `#abstract-lib-select`, `#btn-generate-blocks`)가 있는지 점검. 없으면 해당 요소에 `id`만 부여(동작 변경 없음). 실제 id가 다르면 테스트의 셀렉터를 실제 값으로 맞춘다.

- [ ] **Step 2: 실패 확인**

Run: `PORT=3100 npx playwright test tests/ir_lib_blocks.spec.js -g "lib pipeline"`
Expected: FAIL — 구 `handleAbstractLibrary`가 `engine.registerBlock`(레지스트리 아님)을 써서 `BlockPyLibRegistry.getLibSpec`가 비고, invalid block도 등록돼 `bad=true`.

- [ ] **Step 3: `handleAbstractLibrary` 교체** — `src/App.jsx` 589–651 전체 교체

```js
  const handleAbstractLibrary = async (libKey, customCode) => {
    setIsAbstracting(true);
    setAiThoughts([]);
    setLogs(prev => [...prev, `[AI Agent] Abstracting library: "${libKey}"...`]);
    const reg = window.BlockPyLibRegistry;

    try {
      // Best-effort introspection grounding (live Pyodide). Failure is fine — AI works from name.
      let facts = null;
      try {
        const py = await window.BlockPyAstBridge.getPyodide();
        const engine = new window.BlockPyAbstraction.LibraryAbstractionEngine();
        facts = await engine.introspectModule(libKey, py);
      } catch (_) { facts = null; }

      // Ask the backend; on 503 (no keys) fall back to the offline preset.
      let libName = libKey;
      let blocks = [];
      let thoughts = [];
      const response = await fetch('/api/ai-abstract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libName: libKey, customCode, facts }),
      });
      if (response.status === 503) {
        const preset = window.BlockPyAbstraction.AI_PRESETS[libKey];
        if (!preset) {
          setLogs(prev => [...prev, `[AI Agent] No API keys and no offline preset for "${libKey}".`]);
          return;
        }
        blocks = preset.blocks;
        thoughts = preset.thoughts;
        setLogs(prev => [...prev, `[AI Agent] No API keys — using offline preset for "${libKey}".`]);
      } else {
        const data = await response.json();
        if (!data.success) {
          setLogs(prev => [...prev, `[AI Agent Error] ${data.error}`]);
          return;
        }
        libName = data.libName || libKey;
        blocks = data.blocks || [];
        thoughts = data.thoughts || [];
      }

      // Stream the thoughts for the UI.
      const revealed = [];
      for (const thought of thoughts) {
        revealed.push(thought);
        setAiThoughts([...revealed]);
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Register each CALL block through the round-trip oracle. Macro-shaped responses (no
      // func / no args array) are skipped in the MVP. Oracle failures are demoted (not registered).
      let pyForOracle = null;
      try { pyForOracle = await window.BlockPyAstBridge.getPyodide(); } catch (_) { pyForOracle = null; }
      const registered = [];
      let rejected = 0;
      for (const b of blocks) {
        if (typeof b.func !== 'string' || !Array.isArray(b.args)) { rejected++; continue; } // macro/invalid
        const spec = { module: libName, func: b.func, argNames: b.args, hasOutput: !!b.hasOutput, colour: b.colour, title: b.title };
        if (pyForOracle) {
          const ok = await reg.validateSpecParse(spec, window.BlockPyAstBridge.pythonToIR, pyForOracle);
          if (!ok) { rejected++; setLogs(prev => [...prev, `[AI Agent] Demoted "${spec.title}" (round-trip oracle).`]); continue; }
        }
        const res = reg.registerLibBlock(spec);
        if (!res.ok) { rejected++; setLogs(prev => [...prev, `[AI Agent] Demoted "${spec.title}" (${res.reason}).`]); continue; }
        registered.push({ type: res.type, title: spec.title, hasOutput: spec.hasOutput, func: spec.func, args: spec.argNames, colour: spec.colour });
      }
      reg.persist();

      setInstalledBlocks(prev => {
        const filtered = prev.filter(p => !registered.some(r => r.type === p.type));
        return [...filtered, ...registered];
      });
      setLogs(prev => [...prev, `[Library] ✅ Registered ${registered.length} block(s) for "${libName}"${rejected ? `, ${rejected} demoted` : ''}.`]);
    } catch (err) {
      console.error(err);
      setLogs(prev => [...prev, `[AI Agent Error] ${err.message}`]);
    } finally {
      setIsAbstracting(false);
    }
  };
```

- [ ] **Step 4: 통과 확인**

Run: `PORT=3100 npx playwright test tests/ir_lib_blocks.spec.js -g "lib pipeline"`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/App.jsx src/components/LibraryManager.jsx tests/ir_lib_blocks.spec.js
git commit -m "$(cat <<'EOF'
feat(ir): registry pipeline — presets/AI/introspection + oracle + 503 fallback (Phase 5 slice 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

> `LibraryManager.jsx`를 수정하지 않았다면 `git add`에서 빼라(존재하는 파일만 add). **`package-lock.json`은 절대 add 금지.**

- [ ] **Step 6: Codex 게이트** (Bash) — blocking 0.

---

### Task 5: 영속화 e2e + 회귀 스윕

**Files:**
- Test: `tests/ir_lib_blocks.spec.js` (browser describe: "lib persistence (browser)")
- (코드 변경 없음 — Task 1·3에서 구현한 persist/hydrate의 end-to-end 검증)

**Interfaces:**
- Consumes: 전체 스택(레지스트리·툴박스·App hydrate effect).

- [ ] **Step 1: 실패-가능 테스트 작성** — `tests/ir_lib_blocks.spec.js`에 append

```js
// ── lib persistence (browser) ───────────────────────────────────────────────
test.describe('lib persistence (browser)', () => {
  test('registered library survives a reload (localStorage + hydrate + toolbox)', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__blocklyWorkspace && window.BlockPyLibRegistry && window.BlockPyBuildIrToolbox,
      null, { timeout: 180000 });

    // register + persist
    await page.evaluate(() => {
      const reg = window.BlockPyLibRegistry;
      reg.clearAll();
      try { window.localStorage.removeItem('blockpy.libRegistry.v1'); } catch (_) {}
      reg.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true, colour: '#06b6d4', title: 'cv2.imread' });
      reg.persist();
    });

    // reload — hydrate() must re-register and the Library category must reappear
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__blocklyWorkspace && window.BlockPyLibRegistry && window.BlockPyBuildIrToolbox,
      null, { timeout: 180000 });
    await page.waitForFunction(
      () => !!window.BlockPyLibRegistry.getLibSpec('lib_cv2_imread'), null, { timeout: 30000 });

    const out = await page.evaluate(() => {
      const tb = window.BlockPyBuildIrToolbox();
      const lib = tb.contents.find((c) => c.name === 'Library');
      return { restored: !!window.BlockPyLibRegistry.getLibSpec('lib_cv2_imread'),
               inToolbox: !!(lib && lib.contents.find((b) => b.type === 'lib_cv2_imread')) };
    });
    expect(out.restored).toBe(true);
    expect(out.inToolbox).toBe(true);

    // cleanup so the persisted entry doesn't leak into later runs
    await page.evaluate(() => { window.BlockPyLibRegistry.clearAll(); try { window.localStorage.removeItem('blockpy.libRegistry.v1'); } catch (_) {} });
  });

  test('a comment on a lib block survives the round-trip', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.BlockPyIR && window.BlockPyAstBridge && window.BlockPyLibRegistry, null, { timeout: 180000 });
    const code = await page.evaluate(async () => {
      const reg = window.BlockPyLibRegistry;
      reg.clearAll();
      reg.registerLibBlock({ module: 'cv2', func: 'imshow', argNames: ['winname', 'mat'], hasOutput: false, title: 'cv2.imshow' });
      const ws = { blocks: { blocks: [
        { type: 'lib_cv2_imshow_stmt',
          data: JSON.stringify({ leading: ['# show it'], trailing: null, after: [] }),
          icons: { comment: { text: '# show it', pinned: false, height: 80, width: 160 } },
          inputs: {
            ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"win"' } } },
            ARG1: { shadow: { type: 'ir_name', fields: { ID: 'img' } } } } },
      ] } };
      const ir = window.BlockPyIR.blocklyToIr(ws);
      const py = await window.BlockPyAstBridge.getPyodide();
      return (await window.BlockPyAstBridge.irToPython(py, ir)).trim();
    });
    expect(code).toContain('# show it');
    expect(code).toContain("cv2.imshow('win', img)");
  });
});
```

- [ ] **Step 2: 실행**

Run: `PORT=3100 npx playwright test tests/ir_lib_blocks.spec.js -g "lib persistence"`
Expected: PASS (2 tests). 실패하면 systematic-debugging으로 근본원인 수정(추정 금지).

- [ ] **Step 3: 전체 IR 회귀 스윕** — 기존 IR 스펙들이 깨지지 않았는지 확인

Run: `PORT=3100 npx playwright test tests/ir_lib_blocks.spec.js tests/ir_comments.spec.js`
Expected: 전부 PASS. (사전-존재 실패 4건은 [[preexisting-test-failures]] 참고 — IR 스펙과 무관, 회귀로 오인 금지.)

- [ ] **Step 4: 커밋**

```bash
git add tests/ir_lib_blocks.spec.js
git commit -m "$(cat <<'EOF'
test(ir): library block persistence + comment round-trip e2e (Phase 5 slice 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Codex 전체-브랜치 게이트** (Bash) — `git diff master...HEAD` 범위 적대 리뷰 → blocking 0.

- [ ] **Step 6: blockpy-roundtrip-verify 라이브 검증(선택, 권장)** — 실제 UI에서 라이브러리 블록 등록→드래그→Python 생성이 화면에 맞게 보이는지 스크린샷 판정.

---

## Self-Review (작성자 체크 — 작성 후 확인 완료)

**1. Spec coverage:** 스펙 §4.1 libRegistry→Task1, §4.2 lower 훅→Task2, §4.3 오라클(정적=Task1, 파싱=Task1 `validateSpecParse`+Task4 사용)→Task1/4, §4.4 툴박스→Task3, §4.5 파이프라인(프리셋/인트로/AI)→Task4, §4.6 영속화→Task1(구현)+Task3(hydrate 배선)+Task5(e2e). §7 테스트 전부 매핑. §9 불변식: 단일 IR 정합성(Task2 테스트가 ir_call과 동일 스키마 비교), 주석 보존(Task5), raw=0 불변(새 노드 없음 — Call 재사용).

**2. Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 완전한 코드 포함.

**3. Type consistency:** `spec` 형태(`module/func/argNames/hasOutput/colour/title`) 전 태스크 일관. `registerLibBlock`/`getLibSpec`/`listLibBlocks`/`validateSpecParse`/`hydrate` 시그니처 Task1 정의 ↔ Task2~5 사용 일치. `lowerLibBlock`이 내는 `Call`/`Attribute`/`Name` 스키마는 `blocklyToIr`의 `ir_call`(`{type:'Call',func,args,keywords}`)·`ir_attribute`(`{type:'Attribute',value,attr}`)와 동일. `window.BlockPyBuildIrToolbox` 노출(Task3) ↔ App effect 사용(Task3) 일치.
