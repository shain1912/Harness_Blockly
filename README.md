# BlockPy

A browser playground for **1:1 bidirectional, lossless conversion between Blockly visual blocks and Python text**. Edit code as blocks or as text — both stay in sync, and converting one to the other and back is lossless (comments aside). A React + Vite frontend pairs with a small Express backend that proxies AI calls.

The core is a hand-written Python compiler (lexer → AST → Blockly JSON, and back), an AST desugarer, two execution engines, and AI-generated dynamic toolbox blocks.

## Features

- **Bidirectional sync** — write Python or drag blocks; the other side updates live. Python → blocks always desugars (list comprehensions, ternaries, chained comparisons) into block-friendly forms.
- **Lossless round-trip** — block ↔ text preserves structure. Constructs without a dedicated block fall back to a raw block that re-emits the original source verbatim.
- **Scratch3/MakeCode look** — Blockly's `zelos` renderer with a light theme. Dynamic-arity blocks (`print`, function calls, list/dict/set/tuple, method calls) have inline `+`/`–` buttons to add/remove argument slots.
- **Two execution engines**
  - **Run** → real Python in [Pyodide](https://pyodide.org/) (WASM), with a mocked `sprite` turtle and `cv2`; auto-installs detected imports via micropip.
  - **Step / Pause** → a JS AST-walking interpreter for debugging and turtle drawing.
- **Real shell run** — optionally run real local Python via the backend (real OpenCV, webcam, `imshow`).
- **Custom blocks** — `sprite_*` turtle/pen blocks, `cv2_*` OpenCV blocks, class/method definitions, and AI-generated dynamic library blocks (numpy, pandas, matplotlib, requests…).
- **Gray-block inspector** — lists any raw/unconverted blocks remaining after a conversion and jumps to each.

## Quick start

```bash
npm install
npm start        # frontend (Vite :3000) + backend (Express :3001) together
```

Open http://localhost:3000.

Other scripts:

```bash
npm run dev      # frontend only (Vite :3000)
npm run server   # backend only (Express :3001)
npm test         # Playwright e2e (auto-starts the Vite dev server)
```

### AI features (optional)

The backend proxies AI calls to MiniMax via the Anthropic SDK (`https://api.minimax.io/anthropic`). Put one or more keys in `.env` as `MINIMAX1`..`MINIMAX4` (round-robin pool). Without keys, `/api/desugar` and `/api/health` still work; the AI endpoints (`/api/ai-normalize`, `/api/ai-abstract`, `/api/ai-chat`) return 503 or fall back to the heuristic desugarer.

## Architecture

### Compiler core (`src/utils/*.js`)

These four files are imported by `src/main.jsx` **for side effects** — each attaches a global the rest of the app calls as `window.BlockPy*` (they also `module.exports` so the backend and tests can `require()` them in Node).

| Global | File | Responsibility |
|---|---|---|
| `window.BlockPyParser` | `src/utils/parser.js` | Tokenizer + Parser (Python → AST), `astToPython` (AST → Python), `astToBlockly` (AST → Blockly JSON). Defines every custom Blockly block and its `Blockly.Python` generator. |
| `window.BlockPyDesugarer` | `src/utils/desugarer.js` | Rewrites comprehensions, ternaries, and chained comparisons into block-friendly forms. |
| `window.BlockPyInterpreter` | `src/utils/interpreter.js` | AST-walking JS interpreter used for Step/Pause debugging and turtle drawing. |
| `window.BlockPyAbstraction` | `src/utils/libraryAbstraction.js` | Registers dynamic toolbox blocks at runtime; holds offline block presets (cv2, requests, matplotlib, pandas…). |

`Blockly` is loaded from CDN in `index.html` (not npm). `src/utils/pyodideRunner.js` is the one real ES module, imported by `App.jsx`.

### Frontend (`src/`)

`App.jsx` owns layout and state. Left: `Stage.jsx` (canvas + run controls) and tabbed `VariableWatch` / `ConsoleLogs` / `LibraryManager`. Right: tabbed `BlocklyEditor` / `PythonEditor` / desugared-code preview / `ASTTreeView`. The live workspace is exposed as `window.__blocklyWorkspace`.

### Backend (`server.js`)

Express on :3001. Vite proxies `/api/*` to it. Serves desugar + AI endpoints; `require()`s the compiler core from `src/utils/`.

## Project structure

```
index.html              # app shell; loads /src/main.jsx + Blockly from CDN
server.js               # Express backend (AI proxy + desugar)
vite.config.js          # Vite :3000, /api proxy, COOP/COEP headers for Pyodide
src/
  main.jsx App.jsx      # entry + root component
  components/           # Stage, BlocklyEditor, PythonEditor, panels…
  utils/                # parser, desugarer, interpreter, libraryAbstraction, pyodideRunner
tests/                  # Playwright e2e specs + fixtures
python.md               # Python syntax catalog (coverage reference)
block_gap_analysis.md   # audit of catalog vs. implemented blocks
DOCS/superpowers/       # design specs + implementation plans
papers/                 # background research notes
```

## Testing

All tests are Playwright e2e (no unit runner). Playwright auto-starts the Vite dev server; tests that hit AI endpoints also need `npm run server` running. The pure-Node round-trip suites (`tests/random_roundtrip.spec.js`, `tests/realistic_roundtrip.spec.js`) call `astToPython` directly and are the authoritative lossless gate.

```bash
npm test                                   # everything
npx playwright test tests/e2e.spec.js      # one spec
npx playwright test -g "hello world"       # one test by title
npm run test:report                        # open the HTML report
```

See `CLAUDE.md` for contributor conventions (adding blocks, field-name parity, round-trip rules).
