# IR Toolbox — Drag-to-Edit Restoration (Design)

> Status: approved 2026-06-15. Successor to the IR pipeline app-integration
> (`651e2be`, spec `2026-06-08-ir-pipeline-app-integration-design.md`), which
> emptied the legacy toolbox because `blocklyToIr` only understands `ir_*` types.

## Problem

After the IR engine swap, `index.html`'s `<xml id="toolbox">` was left empty. Blocks
now only appear via the Python → Convert path; the **drag-a-new-block-from-the-toolbox
edit path is dead**. This restores it with a toolbox populated entirely by `ir_*` blocks.

## Decisions (locked during brainstorming)

1. **Full exposure, by category.** Every standalone `ir_*` block is exposed, grouped by
   worklist family. This preserves the raw=0 전수성 philosophy — the toolbox is the closed
   3.12 node set made draggable. HELPER-only blocks valid only inside a parent
   (`ir_formattedvalue`, which lives inside `ir_joinedstr`) are **excluded**.
2. **Shadow defaults for required inputs.** A freshly-dragged block must always convert to
   valid Python. Required *value/expr* inputs carry shadow default children; statement
   *bodies* stay empty (already synthesized to `pass` by `stmtListOrPass`).
3. **JS declarative table → JSON toolbox.** A single family table in `src/utils/irToolbox.js`
   compiles to a Blockly JSON toolbox. Chosen over hand-written XML because mutator
   (variable-arity) blocks need a valid default `extraState`, which is clean as JSON
   `extraState` but awkward as XML `<mutation>`.

## Architecture

### `src/utils/irToolbox.js` (new)
- Exports a **family table**: ordered list of `{ name, colour, blocks: [...] }`, where each
  block entry is `{ type, default? }`. `default` is `{ extraState?, inputs? }` describing the
  shadow children / mutator arity for that block's required inputs.
- `buildIrToolbox()` compiles the table → a Blockly JSON toolbox
  (`{ kind: 'categoryToolbox', contents: [...] }`). Block entries become
  `{ kind: 'block', type, extraState?, inputs? }` with `inputs` holding `{ shadow: {...} }`.
- Attaches `window.BlockPyIrToolbox` (the built object) for side-effect consumers and
  `module.exports` for Node tests. Loaded as a side-effect import in `main.jsx` **after**
  `irBlocks.js` (block defs must exist first).

### Category structure (worklist order)
```
Values        ir_name, ir_const
Collections   ir_list, ir_tuple, ir_set, ir_dict
Operators     ir_binop, ir_unaryop, ir_boolop, ir_compare
Access        ir_attribute, ir_subscript, ir_slice, ir_starred
Variables     ir_assign, ir_augassign, ir_annassign, ir_namedexpr,
              ir_delete, ir_global, ir_nonlocal
Control flow  ir_if, ir_while, ir_for, ir_break, ir_continue, ir_pass
Functions     ir_funcdef, ir_lambda, ir_return, ir_call, ir_exprstmt
Classes       ir_classdef
Exceptions    ir_try, ir_trystar, ir_raise, ir_assert, ir_with
Imports       ir_import, ir_importfrom
Sugar         ir_listcomp, ir_setcomp, ir_dictcomp, ir_genexp, ir_ifexp
Async         ir_asyncfuncdef, ir_asyncfor, ir_asyncwith,
              ir_await, ir_yield, ir_yieldfrom
Text          ir_joinedstr
Match         ir_match
Types         ir_typealias
```

### `src/components/BlocklyEditor.jsx` (modify)
One-line change: `toolbox: window.BlockPyIrToolbox` instead of
`document.getElementById('toolbox')`. The existing MakeCode-style per-category colour-bar
painting keeps working (it reads category colours from the injected toolbox).

### `index.html` (modify)
Remove the empty `<xml id="toolbox">` stub (and its retirement comment).

### `src/utils/blocklyToIr.js` (modify — three coupled changes, review-hardened)
`blocklyToIr` reads `input.block` at ~45 sites and ignores Blockly's `shadow` key. A block
left with only its shadow default serializes as `inputs.X = { shadow: {...} }` (no `block`).

1. **Shadow→block normalization (`normInputs`).** At the dispatcher entry
   (`blockToExpr`/`blockToStmt`/`fvToIr`), normalize each block's inputs once —
   `input.block = input.block || input.shadow`. Every downstream `.block` access then works
   unchanged for both real and shadow children. No per-site edits; recursion normalizes nested
   children.
2. **Clone, don't mutate the caller's snapshot.** `normInputs` mutates input objects in place,
   and the production snapshot is **not** a throwaway — `BlocklyEditor.regenerate()` hands the
   same object to `onSnapshotChange`, which persists it (`blocklySnapshotRef`) and reloads it on
   tab-switch / remount. So `blocklyToIr` **deep-clones** `ws.blocks.blocks` once at entry; all
   mutation stays on the private copy and a shadow default never hardens into a real block.
3. **Context-only orphans skipped by block type.** A disconnected `ir_slice`/`ir_starred` is an
   incomplete fragment that would unparse to invalid Python (`:`, `*args`). `topToStmt` wraps a
   bare top-level expression block as `Expr`, but returns `null` for `CONTEXT_ONLY_BLOCKS`
   (`ir_slice`, `ir_starred`) — keyed by **block type, checked before `blockToExpr`**, because a
   Convert-produced `ir_starred` has no shadow on `VALUE` and evaluating an empty one would throw
   and stall regeneration for the whole workspace.

## Default-input inventory (which blocks get shadows)

Value/expr inputs that are required (parser would crash without a child). Bodies/optional
inputs omitted.

| Block | extraState | shadow inputs |
|---|---|---|
| ir_assign | `{n:1}` | TARGET0=ir_name(x), VALUE=ir_const(0) |
| ir_augassign | — | TARGET=ir_name(x), VALUE=ir_const(1) |
| ir_annassign | — | TARGET=ir_name(x), ANN=ir_name(int), VALUE optional |
| ir_binop | — | LEFT=ir_const(0), RIGHT=ir_const(0) |
| ir_unaryop | — | OPERAND=ir_const(0) |
| ir_boolop | `{n:2}` | VAL0=ir_const(True), VAL1=ir_const(False) |
| ir_compare | `{n:1}` | LEFT=ir_const(0), CMP0=ir_const(0) |
| ir_attribute | — | VALUE=ir_name(obj) |
| ir_subscript | — | VALUE=ir_name(obj), SLICE=ir_const(0) |
| ir_starred | — | VALUE=ir_name(args) |
| ir_namedexpr | — | VALUE=ir_const(0) |
| ir_if / ir_while | — | TEST=ir_const(True) |
| ir_for / ir_asyncfor | — | TARGET=ir_name(i), ITER=ir_name(items) |
| ir_call | `{nargs:0,...}` | FUNC=ir_name(func) |
| ir_return | — | (optional — no shadow) |
| ir_delete | `{n:1}` | TARGET0=ir_name(x) |
| ir_raise / ir_assert | — | per block: minimal valid expr |
| ir_lambda | — | BODY=ir_const(0) |
| ir_ifexp | — | BODY=ir_const(0), TEST=ir_const(True), ORELSE=ir_const(0) |
| ir_await/ir_yieldfrom | — | VALUE=ir_name(x) |
| ir_yield | — | (bare yield — optional) |
| comprehensions | gens=1 | ELT/KEY/VAL=ir_const, TARGET0=ir_name, ITER0=ir_name |
| ir_subscript SLICE via ir_slice | — | bounds optional |

(Exact extraState keys read from each block's `saveExtraState`/`loadExtraState` in
`irBlocks.js` during implementation — the table above is the contract, field names verified
against code.)

## Testing

1. **Node unit** `tests/ir_toolbox.spec.js` (require-able, no server):
   - `buildIrToolbox()` returns a well-formed `categoryToolbox` (every category has a name,
     colour, ≥1 block; every block has a `type`).
   - **Coverage gate (mirrors raw=0):** every standalone `ir_*` type registered in
     `irBlocks.js` appears in exactly one category — fails loudly if a future block is added
     without a toolbox home. The explicit HELPER exclusion list (`ir_formattedvalue`) is the
     only permitted gap.
2. **Browser e2e** `tests/ir_toolbox.spec.js` (Playwright, `PORT=3100`): for each toolbox
   block, instantiate it from its toolbox JSON into the live workspace and run the full
   **round-trip** `blocklyToIr → irToPython → pythonToIR` — the emitted Python must parse back
   into IR, not merely be non-empty (a stronger oracle than no-throw, catching a default that
   unparses to unparseable text). `CONTEXT_ONLY` blocks (`ir_slice`/`ir_starred`) are exempt:
   they intentionally emit no statement (asserted `body.length === 0`).
3. **Shadow normalization + non-mutation** node tests in `ir_toolbox.spec.js`: a value input
   holding only a `shadow` converts identically to one holding a `block`; a real `block` wins
   over its `shadow`; and `blocklyToIr` leaves its input snapshot byte-for-byte unchanged
   (no shadow-hardening across a recovery cycle).
4. **Context-only safety** node test: a bare `ir_starred` with no child (the Convert-style,
   no-shadow case) is skipped rather than throwing.
5. **Render check:** run `blockpy-roundtrip-verify` on a sampling of dragged blocks.

### Dynamic-library palette (out of scope — deferred to Phase 5)
Removing the `<xml id="toolbox">` stub leaves `App.jsx`'s `installedBlocks` effect
(`getElementById('toolbox')`) inert — it no-ops because the live palette is now the JS-built
`window.BlockPyIrToolbox`, and a non-`ir_*` library block can't round-trip through `blocklyToIr`
anyway. The effect is documented as intentionally inert (guard kept, not deleted) so Phase 5
(IR-aware library blocks + a Library category via `updateToolbox(jsonObject)`) can adapt it.

## Workflow

Implemented TDD, then the project's Claude→Codex adversarial review loop
(`codex exec review`), gate on Codex blocking 0 before commit. `PORT=3100` for all browser
tests (port 3000 is occupied by another project).

## Out of scope

Phase 3 comment preservation, Phase 4 desugar-as-feature, Phase 5 AI/dynamic library blocks,
toolbox search/flyout customization beyond categories.
