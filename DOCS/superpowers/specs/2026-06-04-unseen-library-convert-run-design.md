# Unseen-Library pip → Convert → Run — Design

Date: 2026-06-04
Status: Approved (skeleton + demo library) — proceeding to implementation plan

## Context & Goal

Sub-project **B** of the BlockPy demo effort. Goal: a never-before-seen Python library
can be (1) **installed** via pip/micropip, (2) **immediately converted** to Blockly
blocks, and (3) **executed** — with no manual "Generate Blocks with AI" step. The flow
must preserve BlockPy's core value: 1:1 lossless block ↔ Python round-trips.

Sibling sub-projects: A (demo gallery — DONE), C (build-libraries-with-blocks — later).

User directive (standing): for any missing block or ambiguous conversion, ask the user.

## What already works (verified)

- **Install**: `pyodideRunner.js` auto-detects imports at Run time and micropip-installs
  them; the LibraryManager pip box installs on demand. Verified end-to-end: `humanize`
  installed in-app and `humanize.intcomma(1234567)` printed `1,234,567`.
- **Dynamic blocks**: `LibraryAbstractionEngine.registerBlock(lib, func, args, hasOutput,
  colour, title)` creates a `lib_<lib>_<func>` block + a Python generator that emits
  `lib.func(arg0, …)`. The AI-abstract button (`/api/ai-abstract` → MiniMax) uses it.
- **Convert uses registered blocks**: `convertCallExpression` already maps a
  `lib.func(args)` call to its `lib_<lib>_<func>` block **if that block is registered**.

## The gap

The on-the-fly auto-registration branch in `convertCallExpression` (parser.js, the
`if (!Blockly.Blocks[blockType] && window.appOrchestrator?.abstractionEngine)` block)
targets the **legacy vanilla-JS `window.appOrchestrator`**, which does not exist in the
React app. So converting Python that uses a library whose blocks were never generated
falls through to a lossless-but-plain `raw_statement`. It also pokes React-owned DOM
(`document.getElementById('dynamic-blocks-list')`) directly — an anti-pattern.

## Architecture — separate concerns, wire auto-register into React

| Unit | Responsibility |
|---|---|
| **Parser** (`convertCallExpression`) | On an unknown `lib.func(args)` call, register the Blockly block via a shared engine exposed at `window.__blockpyEngine`. **Only `registerBlock` + push to `engine.activeBlocks`** — no DOM, no React state, no `document.getElementById`. |
| **App (React)** | Create ONE persistent `LibraryAbstractionEngine(workspace)` in the init effect, expose it as `window.__blockpyEngine` and keep it in a ref. After `syncCodeToBlocks` runs `astToBlockly`, read `engine.activeBlocks` and `setInstalledBlocks(...)`; the existing `installedBlocks` → toolbox `useEffect` repaints the palette. |
| **Execution** | Unchanged — `pyodideRunner` auto-installs detected imports and runs. |

This removes the dead `window.appOrchestrator` reference and the parser's DOM-poking; the
parser becomes a pure block factory, React owns all UI state.

### Detection rule (what counts as an "unknown library call")

Reuse the existing `getCallFullPath(funcNode)` → `{ lib, func }`. Auto-register when:
- the call is `name.func(...)` form (so `lib !== 'global'`), AND
- `func` / `lib` is not already a built-in mapping (print/range/sprite/cv2 keep their
  current handling), AND
- the `lib_<lib>_<func>` block is not yet registered.

Bare user-function calls (`lib === 'global'`, e.g. `inc()`) are NOT auto-registered —
they stay as their current lossless representation. Method calls on a non-import object
(e.g. `cap.read()`) are out of scope for auto-registration (they remain raw / existing
handling); the demo uses module-level `lib.func(...)` calls.

### Lossless round-trip

A dynamic `lib_<lib>_<func>` block takes positional args as value inputs `ARG0…ARGn` and
its generator emits `lib.func(arg0, …)`. While the block is registered, Python → block →
Python is exact. Arg COUNT is fixed at first registration; if a later call uses a
different arity, register a distinct block keyed by `lib_<lib>_<func>_<argc>` to avoid a
silent arity mismatch. (The parser does not support keyword args, so only positional
calls occur — matches the demo scope.)

## Demo library & scenario

Demo library: **`humanize`** (pure-Python, micropip-installable, clear stdout). Gallery
snippet (`execute: true`) added to `src/examples/snippets.js`, new category `Libraries`:

```python
import humanize
print(humanize.intcomma(1234567))
print(humanize.ordinal(21))
print(humanize.naturalsize(1048576))
```
Expected stdout: `1,234,567`, `21st`, `1.0 MB`.

Presentation flow: paste/select the snippet → **Convert** (dynamic `lib_humanize_*`
blocks appear automatically) → toggle to blocks to show the visual form → **Run**
(micropip installs humanize, prints the three lines).

## Components & files touched

- **Modify**: `src/utils/parser.js` (`convertCallExpression` auto-register branch →
  `window.__blockpyEngine`, strip DOM-poking), `src/App.jsx` (persistent engine +
  `window.__blockpyEngine` + sync `installedBlocks` after convert),
  `src/examples/snippets.js` (humanize snippet + `Libraries` category).
- **Test**: extend `tests/examples_roundtrip.spec.js` coverage via the new snippet; add a
  focused spec asserting an unseen-lib Convert auto-creates the `lib_*` block and runs.

## Error handling & "ask the user" gate

- If a real PyPI install fails in Pyodide (C-extension package), the run surfaces the
  micropip error in the console; the gallery snippet uses a verified pure-Python lib.
- If an unseen call cannot round-trip (e.g. an unusual call form), STOP and ask the user
  whether to add a dedicated block, swap the example, or accept a raw_statement.

## Testing strategy

- Node-level: `humanize.*` calls round-trip via the dynamic block generator (registered
  in a test harness) — AST round-trip of the snippet.
- Playwright: snippet Convert produces `lib_humanize_intcomma` etc. (no `raw_statement`
  for the lib calls) and Run prints the expected three lines.

## Out of scope

- Sub-project C (authoring library blocks visually).
- Keyword-argument calls, chained method calls on returned objects, non-module method
  auto-registration.
- The AI-abstract button stays as-is (still available for richer named blocks); this
  sub-project makes auto-registration the default path, not a replacement for AI.
