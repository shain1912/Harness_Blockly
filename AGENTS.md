# AGENTS.md

All project guidance — commands, backend env, architecture, and extension conventions — lives in
**[CLAUDE.md](./CLAUDE.md)**. Read that file first; this one only adds agent-specific notes.

Key facts agents get wrong from stale context:

- The conversion core is the **live CPython-3.12 ast IR pipeline** (`src/utils/pyAstBridge.js`,
  `irToBlockly.js`, `blocklyToIr.js`, `irBlocks.js`, `irToolbox.js`, `libRegistry.js`,
  `libImport.js`). The hand-written parser (`src/utils/parser.js`, `window.BlockPyParser`) is
  **legacy/frozen** — retired from conversion; `blocklyToIr` throws on non-`ir_*` blocks, so
  adding blocks the old way silently produces dead code.
- Blockly and Pyodide are **vendored** under `public/vendor/` (`npm run vendor`), not loaded
  from a CDN. The Run button executes real Python via the backend `/api/run-python`.
- Never hardcode library/function name tables — introspection only (`/api/blockify`, Jedi
  `/api/infer-types`, `importlib.metadata`).
- CI merge gates: `npm run test:ir` + `npm run test:gen` (see `.github/workflows/validity.yml`);
  `npm run test:validity` pins the frozen legacy path and is non-gating.
- Do not `git commit`/`push` unless explicitly asked.
