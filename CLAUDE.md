# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BlockPy — a browser-based playground for **1:1 bidirectional, lossless conversion between Blockly visual blocks and Python text**. A React 19 + Vite frontend pairs with a small Express backend that proxies AI calls to MiniMax (via the Anthropic SDK). The core value is the hand-written Python compiler (lexer → AST → Blockly JSON, and back) plus an AST desugarer, two execution engines, and AI-generated dynamic toolbox blocks.

## Commands

```bash
npm install          # install deps
npm start            # run BOTH frontend (Vite :3000) + backend (Express :3001) via concurrently
npm run dev          # frontend only (Vite :3000)
npm run server       # backend only (Express :3001)

npm test             # Playwright e2e (auto-starts the Vite dev server on :3000)
npm run test:e2e     # tests/e2e.spec.js only
npm run test:p0p1    # tests/test_p0_p1.spec.js
npm run test:p2p4    # tests/test_p2_p4.spec.js
npx playwright test tests/test_pyodide.spec.js   # run a single spec file
npx playwright test -g "hello world"             # run a single test by title
npm run test:ui      # Playwright interactive UI
npm run test:report  # open the HTML report (test-results/report)
```

- Dev server is **port 3000** (see `vite.config.js`); Vite proxies `/api/*` → `http://localhost:3001`.
- Playwright auto-starts `npm run dev` but **not** the backend. Tests that exercise AI endpoints need `npm run server` running separately; parse/desugar/run tests do not.
- There is **no Vitest / unit-test runner** despite older docs mentioning one — all tests are Playwright e2e.

## Backend env

`server.js` reads `MINIMAX1`..`MINIMAX4` from `.env` (round-robin key pool). It uses the `@anthropic-ai/sdk` client pointed at `https://api.minimax.io/anthropic`, model `MiniMax-M2.7` — so "Anthropic" in the code actually talks to MiniMax. With no keys, AI endpoints (`/api/ai-normalize`, `/api/ai-abstract`, `/api/ai-chat`) return 503 or fall back to the heuristic desugarer; `/api/desugar` and `/api/health` work without keys.

## Architecture

### The compiler core lives on `window`, not in ES imports
`src/main.jsx` imports the four `src/utils/*.js` compiler files **for their side effects only** — each file attaches a global and the rest of the app calls it as `window.BlockPy*`. When editing these, preserve the `window.X = X` assignment at the bottom (they also `module.exports` so the backend/tests can `require()` them in Node).

| Global | File | Responsibility |
|---|---|---|
| `window.BlockPyParser` | `src/utils/parser.js` (~2400 lines) | `Tokenizer` + `Parser` (Python → custom AST), `astToPython` (AST → Python), `astToBlockly` (AST → Blockly JSON). **Also defines every custom Blockly block + its `Blockly.Python` generator** (`sprite_*`, `cv2_*`). |
| `window.BlockPyDesugarer` | `src/utils/desugarer.js` | `desugarPythonCode()` + `ASTDesugarer`: rewrites list comprehensions, ternary expressions, and chained comparisons into block-friendly forms. |
| `window.BlockPyInterpreter` | `src/utils/interpreter.js` | `ASTInterpreter` — an AST-walking JS interpreter used **only** for Step/Pause debugging and turtle drawing. |
| `window.BlockPyAbstraction` | `src/utils/libraryAbstraction.js` | `LibraryAbstractionEngine.registerBlock()` registers dynamic toolbox blocks at runtime; `AI_PRESETS` holds offline block specs (cv2, requests, matplotlib, pandas…). |

`window.Blockly` itself is loaded from **CDN in `index.html`** (not npm). `pyodideRunner.js` is the one real ES module (imported normally by `App.jsx`).

### Two separate execution engines (important)
- **Run button** → `src/utils/pyodideRunner.js` runs **real Python in Pyodide (WASM)**. It defines `sprite` and a mocked `cv2` module in Python that call back into JS via `js.window._pyodide_sprite` / `_pyodide_cv2`, and auto-installs detected imports via micropip. Requires COOP/COEP headers (set in `vite.config.js`) for the SharedArrayBuffer interrupt buffer that powers the Stop button.
- **Step / Pause buttons** → the JS `ASTInterpreter` (`window.BlockPyInterpreter`). These two engines are independent; behavior can diverge between them.

### Bidirectional sync (`src/App.jsx`)
- **Block → Python**: `BlocklyEditor.jsx`'s change listener calls `window.Blockly.Python.workspaceToCode(ws)` and pushes the text up.
- **Python → Block** (`syncCodeToBlocks`): `desugarPythonCode` → `astToBlockly` → `Blockly.serialization.workspaces.load`. Convert **always desugars**; the "Auto Desugar" checkbox only affects the Desugarer preview panel and the Step path.
- **Snapshot recovery**: when switching back to blocks, if the Python text is structurally unchanged since the last block edit (`arePythonScriptsEquivalent`), the saved Blockly JSON snapshot is restored verbatim instead of re-parsing — this prevents block drift / layout loss.
- A re-entrancy guard `isSyncingFromCodeRef` stops the block→code listener from firing while code→block sync runs. The live workspace is also exposed as `window.__blocklyWorkspace` (used by tests). `BlocklyEditor.jsx` calls `ws.dispose()` on cleanup to survive React StrictMode double-mount.

### React component layout
`App.jsx` owns all state and the layout. Left panel: `Stage.jsx` (canvas turtle/sprite + run controls), and a tabbed pane of `VariableWatch` / `ConsoleLogs` / `LibraryManager`. Right panel: tabbed `BlocklyEditor` / `PythonEditor` / Desugared-code preview / `ASTTreeView`.

## Legacy / stale docs

The previous vanilla-JS implementation (root `app.js`, `parser.js`, `desugarer.js`, `interpreter.js`, `libraryAbstraction.js`, `index.css`) and the outdated `GEMINI.md` were removed in cleanup — the live app is entirely under `src/` (`index.html` loads only `/src/main.jsx`).

`papers/` contains background research notes that describe an aspirational/older structure (e.g. `src/blocks/`, `src/utils/ast.js`, `transpiler.js`, `AIAgent.jsx`, port 5173, Vitest) that **does not match the current code**. Trust the actual files in `src/` over those notes.

## Conventions when extending

- **Adding a Blockly block type**: define both `Blockly.Blocks['x']` and `Blockly.Python['x']` in `parser.js`, register a `Blockly.Python.forBlock` alias (see the `cv2_*` block at the end of `parser.js`), add it to the toolbox XML in `index.html`, and handle the round-trip in `astToBlockly` / the `Parser`.
- **Field-name parity matters for round-trips**: block field keys must match exactly on both the generator and parser sides (a past bug used `CHANGE` vs `VALUE`). When a round-trip loses data, suspect a field-name or shadow-block mismatch first.
- **Sprite turn normalization**: `turn_left`/negative angles are folded into a single `sprite_turn` block with a `DIRECTION` field — keep that mapping intact.
