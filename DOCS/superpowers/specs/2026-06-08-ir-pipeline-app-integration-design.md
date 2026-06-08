# IR Pipeline → App Integration — Design

**Date:** 2026-06-08
**Branch:** `feature/ast-ir-redesign`
**Predecessor:** `2026-06-07-blockpy-ast-ir-redesign-design.md` (worklist #1–#16 complete, raw=0 achieved)

## Goal

Make the new CPython-3.12 `ast` single-IR pipeline the **live conversion engine** in the
running app, replacing the hand-written `BlockPyParser`/`BlockPyDesugarer` path. The app's
Convert (Python→blocks) and the block→code sync now route through the IR pipeline that the
node-family worklist built and proved lossless.

## Scope decisions (settled in brainstorming)

- **Conversion engine swap only.** New IR pipeline becomes the conversion path. Building an
  `ir_*` toolbox for drag-to-edit is deferred (future work).
- **Old assets deferred, not removed.** `parser.js` (Tokenizer/Parser/astToBlockly + sprite_/
  cv2_ blocks), the dynamic library engine, and the legacy toolbox XML stay loaded but are
  **unused by the conversion path**. robot/sprite remain for future reuse. Non-destructive.
- **Block→code is live + debounced + async** via `blocklyToIr → irToPython`.
- No desugar in conversion: IR keeps SUGAR blocks (ternary/comprehension). Desugar-as-feature
  is Phase 4.

## Architecture

Both directions now depend on Pyodide (CPython 3.12 via WASM), which is async and pre-warmed
on app load (`prewarmEnvironment`; `window.__pyodide` set by `initPyodide`).

### 1. Pyodide readiness helper

- `pyodideRunner.initPyodide` exposes a ready promise: `window.__pyodideReadyPromise` resolving
  with the pyodide instance (set alongside `window.__pyodide`).
- `pyAstBridge.getPyodide()`: returns `window.__pyodide` if present, else `await`s the ready
  promise. All conversion call sites obtain pyodide through it.

### 2. Python → Block (`App.syncCodeToBlocks`, now async)

```
await getPyodide() → pythonToIR(py, code) → irToBlockly(ir)
  → Blockly.serialization.workspaces.load(json, ws)
```

- Remove the `shouldDesugar` / `BlockPyParser.astToBlockly` / `BlockPyDesugarer` branch.
- Keep snapshot recovery (`arePythonScriptsEquivalent` + saved Blockly JSON): unchanged, it is
  pure save/load of workspace JSON and works for `ir_*` blocks.
- Keep svgResize + scrollCenter + gray-block refresh.
- Errors: a Python `SyntaxError` surfaces from `pythonToIR` (via `ast.parse` in Pyodide) — catch
  and report to `syntaxStatus`. `irToBlockly` throws only on an unmapped node (impossible under
  raw=0) — surfaced the same way.
- Re-entrancy guard `isSyncingFromCodeRef` is set true at entry and cleared in `finally`, held
  across the `await` so the block-create events from `load` don't trigger block→code.
- Callers (`Convert` button, demo loader) `await` it.

### 3. Block → Python (`BlocklyEditor` change listener, async + debounced)

```
save(ws) → blocklyToIr(json) → await irToPython(py, ir) → onCodeChange(code)
```

- Replace `Blockly.Python.workspaceToCode(ws)`.
- Debounce ~200ms to coalesce rapid edits and avoid hammering Pyodide.
- Keep the `isSyncingFromCode` re-entrancy guard and `onSnapshotChange(snapshot)`.
- If Pyodide is not ready, skip (the next edit re-tries; Convert also re-establishes code).
- A block outside the IR vocabulary (e.g. a legacy `controls_if` dragged from the old toolbox)
  makes `blocklyToIr` throw → caught and logged as "not part of the IR vocabulary yet"; no crash.

### 4. Legacy retirement (conversion path only)

Remove only the `astToBlockly` / `workspaceToCode` / `desugar` *calls*. Keep `parser.js`,
sprite/cv2 block defs, and the dynamic library engine loaded but inert for conversion.

**Empty the legacy toolbox** (`index.html`): the old categories offered blocks (`text_print`,
`controls_if`, …) the IR `block→code` path cannot consume — dragging one would make
`blocklyToIr` throw and silently stop regenerating Python (a broken block-first workflow).
Since `block→code` is now IR-only and no `ir_*` toolbox exists yet, the toolbox is emptied so
there are no draggable blocks that break the round-trip. The conversion path is
Python → Convert → `ir_*` blocks (edit fields) → Python. An `ir_*` toolbox is explicit future
work. (Resolves a P1 from Codex review.)

## Testing

- **New e2e (Playwright, `PORT=3100`):** load app → type Python → click Convert → assert `ir_*`
  blocks present in `window.__blocklyWorkspace` save → edit a field → assert Python regenerated
  through the IR path. Covers the live async round-trip end to end.
- **Regression:** `ir_unit` / `ir_roundtrip` / `ir_coverage` stay green (pipeline modules
  unchanged). App boots without console errors about the removed parser calls.

## Risks / notes

- Legacy toolbox blocks the IR path can't consume → toolbox emptied (see §4); `blocklyToIr`'s
  throw on an unknown block is still caught (defence in depth) but is now unreachable from the UI.
- Block→code now requires Pyodide; before warmup, block edits don't regenerate code (acceptable;
  Convert is the primary entry and warms it).
