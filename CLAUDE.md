# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BlockPy — a playground for **1:1 bidirectional, lossless conversion between Blockly visual blocks and Python text**. React 19 + Vite frontend; small Express backend (real-Python runner, blockpy-gen introspection, MiniMax AI proxy). The conversion core is a **live CPython-3.12 `ast` IR pipeline**: Python is parsed by the real `ast.parse` running in Pyodide, serialized to a JSON IR, and mapped to/from `ir_*` Blockly blocks (and back via `ast.unparse`). Also ships as an offline Electron desktop app. The old hand-written parser still exists but is **retired from conversion** (see Legacy below).

## Commands

```bash
npm install          # deps
npm run vendor       # copy Blockly/Pyodide/FontAwesome from node_modules into public/vendor.
                     # REQUIRED once after install: public/vendor is gitignored and index.html
                     # loads Blockly from /vendor/blockly (no CDN).
npm start            # frontend (Vite :3000) + backend (Express :3001) via concurrently
npm run dev          # frontend only
npm run server       # backend only

npm test             # ALL Playwright specs (auto-starts Vite on :3000)
npm run test:ir      # live IR pipeline gate — tests/ir_*.spec.js (15 files) — the CI merge gate
npm run test:gen     # blockpy-gen unit tests (node --test; spawns local python) — CI merge gate
npm run test:validity  # LEGACY parser corpora (frozen path; non-gating in CI)
npx playwright test tests/ir_roundtrip.spec.js   # one spec file
npx playwright test -g "hello world"             # one test by title
npm run test:ui      # Playwright interactive UI
npm run test:report  # open the HTML report (test-results/report)

npm run electron:dev # vite build + electron (dev desktop shell)
npm run dist         # build + package the desktop app (prebuild re-vendors assets)
```

- Dev server is **port 3000** (`vite.config.js`; `PORT` env overrides it and `playwright.config.js` honors it); Vite proxies `/api/*` → Express `:3001`. COOP/COEP headers are set for Pyodide's SharedArrayBuffer.
- Playwright auto-starts `npm run dev` but **not** the backend. Conversion specs run keyless and offline (Pyodide in the page); specs that hit the backend (`ir_blockify_app`, AI/shell-run specs) need `npm run server` running separately.
- No unit-test runner in the app itself (all app tests are Playwright); `blockpy-gen/` uses Node's built-in `node --test`.

## Backend env

`server.js` binds **127.0.0.1 only** and rejects any request whose `Host` header is not loopback — it exposes unauthenticated run-python/pip/file endpoints and must never be reachable off-box. AI keys: `MINIMAX1`..`MINIMAX4` in `.env` (round-robin) or a key saved from the in-app Settings (`BLOCKPY_CONFIG` file); the `@anthropic-ai/sdk` client points at `https://api.minimax.io/anthropic`, model `MiniMax-M2.7` — "Anthropic" in the code actually talks to MiniMax. Without keys the AI endpoints (`/api/ai-normalize`, `/api/ai-abstract`, `/api/ai-chat`, `/api/abstract-library`) return 503; `/api/run-python`, `/api/blockify`, `/api/deps`, `/api/infer-types`, `/api/pip-install`, `/api/fs/*`, `/api/health` work keyless. Other env: `BLOCKPY_WORKSPACE` (file-explorer root + run cwd; default `~/BlockPyWorkspace`), `PYTHON_CMD` (python binary), `BLOCKIFY_ALLOW` (restrict which modules `/api/blockify` may import — importing executes top-level code).

## Architecture

### Live conversion core: CPython-3.12 ast IR (globals on `window`, side-effect imports)

`src/main.jsx` imports `src/utils/*.js` for side effects; each attaches a `window.*` global (they also `module.exports` so Node tests can `require()` them).

| Global | File | Responsibility |
|---|---|---|
| `window.BlockPyAstBridge` | `pyAstBridge.js` | `pythonToIR` / `irToPython`: real `ast.parse` / `ast.unparse` inside Pyodide ⇄ JSON IR. Comments preserved (tokenize + `_CommentUnparser`); non-JSON constants tagged `{__py__:…}`. |
| `window.BlockPyIR` | `irToBlockly.js` + `blocklyToIr.js` | IR → Blockly workspace JSON and back. `NODE_POLICY` categorizes **every** 3.12 ast node (raw=0). `blocklyToIr` **throws** on any block outside the `ir_*` vocabulary. |
| (block defs) | `irBlocks.js` | All `ir_*` Blockly block definitions (mutator-style `saveExtraState`/`loadExtraState`, variable arity, [+]/[−]/[+kw] buttons). |
| `window.BlockPyIrToolbox` / `BlockPyBuildIrToolbox` | `irToolbox.js` | Toolbox built **in JS** from `IR_TOOLBOX_TABLE` + one dynamic category per registered library. There is no XML toolbox in `index.html`. |
| `window.BlockPyLibRegistry` | `libRegistry.js` | Registry of introspected library calls/constants/properties/macros/curations; `findLibCall` / `findConst` / `findAttr` / `findBareFunc` drive emerald styling and the library toolbox tabs. |
| `window.BlockPyLibImport` | `libImport.js` | blockpy-gen LibrarySpec → registry specs (dotted module → leaf alias; methods → receiver model). |
| `window.BlockPyIrDesugar` | `irDesugar.js` | Optional IR→IR desugar pass (comprehensions/ternary/chained compare), opt-in via the Auto Desugar toggle. |

`window.Blockly` and Pyodide are **vendored** under `public/vendor/` (`npm run vendor`, gitignored) — fully offline, no CDN (Pyodide falls back to jsDelivr only when not vendored). `pyodideRunner.js` prewarms Pyodide at app load; it is the **conversion runtime**.

### Bidirectional sync
- **Python → blocks**: `src/App.jsx:syncCodeToBlocks` — `pythonToIR` → optional `BlockPyIrDesugar.desugarIr` → auto-blockify referenced libraries (`/api/blockify`) + Jedi type annotation (`/api/infer-types`, degrades silently if backend is off) → `BlockPyIR.irToBlockly` → `Blockly.serialization.workspaces.load`. Snapshot recovery: if the Python text is byte-identical to the last block edit — or parses to the identical IR *including comments* (formatting-only change) — the saved workspace JSON is restored verbatim (no layout drift). Semantic and comment edits always re-convert.
- **Blocks → Python**: `src/components/BlocklyEditor.jsx:regenerate` (debounced change listener) — `workspaces.save` → `BlockPyIR.blocklyToIr` → `irToPython`. A re-entrancy guard (`isSyncingFromCode`) stops the listener during code→block sync; the live workspace is exposed as `window.__blocklyWorkspace` (used by tests).

### Run path (real Python, not Pyodide)
The Run button → `App.jsx:handleRunShell` → POST `/api/run-python`: the backend spawns a real local `python` subprocess and streams stdout/stderr; cwd is the workspace folder shown in the FileExplorer, so file I/O and real cv2 windows work. In the packaged desktop app the bundled `python-embed` runtime is used (`PYTHON_CMD` set by `electron/main.cjs`). Pyodide still powers conversion (and an in-browser fallback runner), but execution goes through the backend.

### Library introspection — NO hardcoded name tables (hard constraint)
`/api/blockify` imports a module in a python subprocess (blockpy-gen `introspect.js`) and returns a LibrarySpec; pip-name → import-name resolves at runtime via `importlib.metadata`. `/api/infer-types` (Jedi, tier-2) resolves receiver types for precise method/property recognition; a deterministic tier-1 pass in `App.jsx:annotateOwnerTypes` fills the gaps. Never add a static table mapping library/function names.

### Curate (human-in-the-loop)
`/api/abstract-library` (needs an AI key) proposes a purpose-driven block subset at a chosen level (초/중/고 = beginner/intermediate/advanced). The user reviews the **preview** (check/uncheck items, rename the tab) before `App.jsx:handleConfirmCuration` creates a ★ curated toolbox tab. A curation is a *view* over already-registered block types — it never adds new lowering.

### Electron desktop
`electron/main.cjs` `require()`s the **same** `server.js` (port 0 → free port), which serves the built `dist/` itself with COOP/COEP headers; the BrowserWindow loads `http://127.0.0.1:<port>`. Bundled `python-embed` is preferred over system python. `npm run dist` packages it (blockpy-gen is `asarUnpack`'d; `python-embed` ships as an extraResource).

## Legacy (frozen — do not extend)

`src/utils/parser.js` (`window.BlockPyParser`), `desugarer.js`, and `libraryAbstraction.js` are still imported in `main.jsx` for side effects (legacy specs / presets) but are **retired from conversion**. Adding a Blockly block or `Blockly.Python` generator there does nothing in the live app: the toolbox is built from `irToolbox.js`, and `blocklyToIr` **throws** on any non-`ir_*` block. `src/utils/interpreter.js` (the old Step/Pause JS interpreter) no longer exists. A set of legacy Playwright specs (~20, including the 7 in `npm run test:validity`) pins the frozen path — keep them green, but never build new features on it. Docs under `papers/` and older `DOCS/` notes describe pre-IR designs; trust `src/`.

## Conventions when extending

- **Adding a block type (IR path only)**: define the `ir_*` block in `irBlocks.js`; categorize the ast node in `irToBlockly.js` `NODE_POLICY` and add its handler; add the inverse lowering in `blocklyToIr.js`; give it a toolbox home in `irToolbox.js` (`IR_TOOLBOX_TABLE`, with shadow defaults so a dragged block is valid Python immediately). The gates enforce completeness: `ir_coverage.spec.js` (every ast node categorized; DB/SUGAR ⇒ handler exists) and `ir_toolbox.spec.js` (every standalone `ir_*` block has exactly one toolbox home, and every toolbox default converts without throwing).
- **Losslessness rule**: the round-trip contract is `ast.dump(parse(original)) == ast.dump(parse(regenerated))`. Field-name parity matters — a block's field/`extraState` keys must match exactly between `irToBlockly` (writer) and `blocklyToIr` (reader). When a round-trip loses data, suspect a key or shadow-block mismatch first.
- **Fixed-block UX (strong user requirement)**: function/method/attribute names are non-editable labels, never free-text fields; variables are native Blockly variable dropdowns (plus the "Create variable…" toolbox button); free text is only for literals (`ir_str`/`ir_const`) and keyword-argument names. Identifier/alias-bearing fields carry fail-loud validators — keep them; never silently coerce an invalid identifier.
