# Demo Example Gallery + Lossless Round-trip Tests — Design

Date: 2026-06-03
Status: Approved (skeleton) — proceeding to implementation plan

## Context & Goal

BlockPy is a playground for 1:1 bidirectional, lossless conversion between Blockly
visual blocks and Python text. This work prepares the playground for an **academic
paper presentation**: a curated set of demo snippets that double as **test code**.
Each snippet must round-trip losslessly (Python → blocks → Python) and execute with a
known output, so that running the test suite proves "every snippet we will demo today
is lossless and runnable."

This is sub-project **A** of a 3-part effort (ordering from the user request):

- **A. Demo example gallery + automated round-trip tests** (this spec; includes OpenCV examples)
- **B. Unseen-library pip-install → convert → run** (later spec; builds on `pyodideRunner.js`)
- **C. Build-a-library-with-blocks** (later spec; builds on `libraryAbstraction.js`)

User directive that governs all three: **for any missing block or ambiguous
conversion, always ask the user** rather than guessing or silently degrading.

## Verification findings that motivate the bug-fix work

A Playwright verification pass over the recently-merged W1–W4 blocks found these
lossy round-trips (these break demo snippets, so they are fixed first):

1. **Subscript read** — `d["a"]`, `t[1]` lose the index/key (collapse to `0`) because
   subscripts are forced into Blockly's list-only `lists_getIndex` (Number-typed,
   1-based), which rejects string keys. **Decision (user-approved): add a dedicated,
   semantically-correct `subscript_get` block** (OBJECT + KEY value inputs, 0-based, any
   key type; works for list/dict/tuple/str). Route `case 'Subscript'` in
   `convertExpressionToBlock` to it.
2. **Comprehension iterable becomes a string literal** — `range(3)` serializes as the
   lossy `text` block `'range(3)'` in dict/set/gen comprehensions because the expression
   fallback in `convertExpressionToBlock` (and the unhandled `Range` node) emits a `text`
   string literal. **Fix: change that fallback to `raw_expression`** (regenerates the
   expression verbatim → lossless) and add an explicit `case 'Range'` → `raw_expression`.
3. **Subscript assignment** — `d["k"] = 7` uses list-only `lists_setIndex` (same key-loss
   defect). **Decision (user-approved): add a dedicated `subscript_set` block**
   (OBJECT + KEY + VALUE) and route the `Assign` case with a `Subscript` target to it.
4. **`nonlocal` / nested function defs** — Blockly's `procedures_def*` are top-level hat
   blocks and cannot nest inside another block's statement stack, so a function-in-a-
   function fails with `MissingConnection`. **Decision (user-approved): convert a nested
   `FunctionDef` to a lossless `raw_statement` text block** (no data loss) and **exclude
   `nonlocal`/closures from the demo gallery** (gallery uses module-level functions only).
5. **Tuple-unpack drops trailing args** — `x, y = 1, 2` renders as `unpack_assign` and the
   following `print(x, y)` loses its second argument. Fix the round-trip so both the
   unpack and the subsequent multi-arg call survive.
6. **`global` body leaks** — a function body containing `global` round-trips partly
   through a lossy `raw_statement`. Fix so the body converts to clean blocks.

Working correctly (no fix needed, for reference): all W1 exception/context blocks, all
W3 operators (incl. aug-assign desugaring to `variables_set` + operator block),
`from_import`, `del`, `yield`, `set_create`, chained `a = b = 5`.

## Architecture — single source of truth (approach A1)

Snippets live in one module, **`src/examples/snippets.js`**, consumed by BOTH the UI
gallery and the test suite. This guarantees the demo and the tests can never drift.

```js
// src/examples/snippets.js  (CommonJS + window global, matching the project's
// existing window.BlockPy* side-effect pattern so Node tests can require() it too)
const DEMO_SNIPPETS = [
  {
    id: 'basics-arithmetic',
    title: '변수와 산술',
    category: 'Basics',
    code: 'x = 10\ny = 3\nprint(x + y)\n...',
    expectedStdout: ['13', '30', '3', '1'],   // substrings expected in console
    desugar: true,                            // checkbox state for this snippet
    execute: true,                            // false → render/convert-only (e.g. OpenCV)
  },
  // ...
];
if (typeof window !== 'undefined') window.BlockPyExamples = DEMO_SNIPPETS;
if (typeof module !== 'undefined') module.exports = { DEMO_SNIPPETS };
```

- **UI**: `PythonEditor.jsx` gains an "예제 (Examples)" `<select>` grouped by category.
  Choosing one fills the Python editor (`setCode`) and, where the snippet specifies,
  sets the Auto-Desugar checkbox. The user then clicks Convert / Run as in a live demo.
- **Tests**: `tests/examples_roundtrip.spec.js` imports `DEMO_SNIPPETS` and, per snippet:
  1. **Parse + AST round-trip (Node-level)**: `astToPython(parse(code))` is
     semantically equal to `code` (whitespace/operator-spacing normalized).
  2. **Render (browser)**: convert to blocks; assert the expected dedicated block types
     appear and **no lossy `raw_statement`/`text`-of-source** block holds raw code.
  3. **Execute (browser)**: for `execute: true`, Run and assert each `expectedStdout`
     substring appears with no `[Parser Error]`/`[Runtime Error]` (poll for
     `✅ Python ready!` / `Execution completed` to absorb Pyodide cold-start).

## Curated snippet set (presentation progression)

Easy → advanced, each chosen to exercise a distinct conversion requirement. Final
wording/values may be tuned during implementation; **any construct that still cannot
round-trip losslessly after the bug fixes is raised to the user, not silently dropped.**

**1. Basics** — `basics-arithmetic` (변수/산술 `+ * // %`), `basics-strings`
(문자열 연결/`.upper()`/`len`).
**2. Data structures** — `ds-list` (append/index/sum), `ds-dict` (subscript read +
subscript assign — exercises fixes #1, #3), `ds-set-tuple` (set dedup, tuple index).
**3. Control flow** — `cf-if` (if/elif/else), `cf-for` (for+range accumulate),
`cf-while` (factorial).
**4. Functions / comprehensions** — `fn-def` (def/return), `fn-listcomp` (list
comprehension — fix #2, desugar OFF), `fn-dictcomp` (dict comprehension — fix #2).
**5. Exceptions / context / generators** — `exc-try` (try/except/finally), `gen-yield`
(generator + `list()`).
**6. Classes** — `cls-basic` (class with `__init__` + method, attribute access).
**7. OpenCV** (`execute` best-effort; render+convert is the assertion) — `cv-gray`
(imread → cvtColor → imshow), `cv-capture` (VideoCapture → read → imshow), `cv-edges`
(GaussianBlur → Canny → imshow). These exercise the existing `cv2_*` blocks; execution
depends on the Pyodide `cv2` mock and is verified best-effort.

## Components & files touched

- **New**: `src/examples/snippets.js` (data), `tests/examples_roundtrip.spec.js` (tests).
- **Edit**: `src/utils/parser.js` (the 6 targeted bug fixes only — no rewrite),
  `src/components/PythonEditor.jsx` (Examples dropdown), `src/App.jsx` (wire dropdown →
  `setCode` + desugar checkbox if needed), possibly `index.html` toolbox (only if a fix
  needs a block/field added). Main.jsx imports `snippets.js` for its side-effect global.

## Error handling & "ask the user" gate

- If a curated snippet fails round-trip after a fix attempt, stop and ask the user
  whether to (a) fix more deeply, (b) swap the snippet, or (c) mark it render-only.
- OpenCV execution failures are expected/acceptable (mock-dependent) and are reported,
  not treated as gallery failures.

## Testing strategy

- Node-level AST round-trip check is fast and runs without a browser (sanity gate per
  bug fix).
- Playwright spec is the authoritative "demo-ready" proof. Target: **all `execute:true`
  snippets green**; OpenCV render-green + execute-best-effort.

## Out of scope (this sub-project)

- Sub-projects B (pip-install unseen libs) and C (build-libraries-with-blocks) — each
  gets its own spec.
- Any parser engine rewrite. Only the 6 targeted round-trip bug fixes.
