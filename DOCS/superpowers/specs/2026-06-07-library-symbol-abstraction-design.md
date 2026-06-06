# Library Symbol Abstraction (Feature B) — Design

**Date:** 2026-06-07
**Status:** Approved (Phase 1), pre-implementation

## Goal

Parse a Python library reference and abstract it into the right *kind* of block, so library
members stop showing up as editable free-text. End state: any `lib.symbol` resolves to a
block matching its kind. Calls already become dedicated `lib_<lib>_<func>` blocks (existing
dynamic-registration path); the gap is **constants / attributes** (`cv2.COLOR_BGR2GRAY`,
`cv2.data.haarcascades`), which today fall to a text-field `attribute_access`.

## Two layers

- **Phase 1 (this spec) — heuristic, synchronous, library-agnostic.** Classify a reference
  by its shape at convert time, no Pyodide needed. A non-called attribute rooted at an
  imported module → a **constant block with a dropdown**. Works for every imported library.
- **Phase 2 (follow-on) — Pyodide introspection.** After the library loads, query real
  `inspect.signature` / `dir(mod)` / `type()` to correct the kind, fill meaningful arg
  labels, and seed the dropdown with the library's actual constants. Enriches Phase 1; does
  not replace it.

## Phase 1 design

### `lib_const` block
- Fields: `LIB` (serializable label, e.g. `cv2`), `CONST` (`FieldDropdown`). Output block.
- Dropdown options (dynamic generator): a seed list for known libs (`cv2` → `COLOR_BGR2GRAY`,
  `COLOR_RGB2GRAY`, `COLOR_GRAY2BGR`, `RETR_EXTERNAL`, `CHAIN_APPROX_SIMPLE`, `data.haarcascades`,
  …) **plus the block's current `CONST` value** if not already present — so any constant
  round-trips even when it isn't in the seed list.
- Generator: `` `${LIB}.${CONST}` `` with `ORDER_MEMBER`.

### Routing (`astToBlockly`)
- At entry, scan the program's `Import` / `FromImport` nodes into an imported-module set
  (module names + aliases).
- In `convertExpressionToBlock`, an `Attribute` node (NOT the callee of a Call) whose root is
  a `Name` in that set → `lib_const` with `LIB = root`, `CONST = ` the dotted remainder
  (`COLOR_BGR2GRAY`, or `data.haarcascades` for nested). Otherwise keep `attribute_access`.
- Calls (`cv2.cvtColor(...)`) are unchanged — the existing `convertCallExpression` dynamic
  path handles them.

### Round-trip
`cv2.COLOR_BGR2GRAY` → `lib_const(cv2, COLOR_BGR2GRAY)` → `cv2.COLOR_BGR2GRAY`.
`cv2.data.haarcascades` → `lib_const(cv2, data.haarcascades)` → `cv2.data.haarcascades`.
Non-module attributes (`obj.attr`, `self.x`) are unaffected — still `attribute_access`.

## Testing
- `tests/lib_const.spec.js` (Node): round-trip + block-type for `cv2.COLOR_BGR2GRAY`,
  `cv2.data.haarcascades`, and a non-cv2 import (`import os` → `os.SEEK_END`); assert
  `lib_const`, no `attribute_access` for these, and that `self.x` / `obj.attr` still use
  `attribute_access`.
- Browser: the dropdown renders, the parsed constant is selected, and the workspace
  regenerates `cv2.COLOR_BGR2GRAY`.
- `npm run test:validity` stays green.

## Out of scope (Phase 2 / later)
Pyodide introspection, real signature labels for `param_N` call args, class/instance method
modeling, generalized per-library seed catalogs beyond a small built-in set.
